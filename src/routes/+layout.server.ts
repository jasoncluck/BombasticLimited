import type { ContentView } from "$lib/components/content/content";
import { getFilterOptionFromQueryParams } from "$lib/components/content/content-filter";
import { getProfile } from "$lib/supabase/user-profiles";
import type { LayoutServerLoad } from "./$types";
import { createHash } from "crypto";

export const load: LayoutServerLoad = async ({
  locals: { safeGetSession, supabase },
  cookies,
  url,
  isDataRequest,
  setHeaders,
  depends,
  request,
}) => {
  depends("supabase:db:profiles");

  const sessionPromise = safeGetSession();

  let view: ContentView;
  if (url.pathname === "/continue") {
    view = "continueWatching";
  } else if (/^\/playlist\//.test(url.pathname)) {
    view = "playlist";
  } else {
    view = "default";
  }

  const contentFilter = getFilterOptionFromQueryParams({
    searchParams: url.searchParams,
    view,
  });

  let layout = cookies.get("PaneForge:layout");
  if (layout) {
    try {
      layout = JSON.parse(layout);
    } catch {
      layout = undefined;
    }
  }

  const { session } = await sessionPromise;

  // Enhanced cache settings for better performance
  const isStaticRoute = [
    "/giantbomb",
    "/nextlander",
    "/remap",
    "/jeffgerstmann",
  ].includes(url.pathname);
  const baseMaxAge = isStaticRoute ? 600 : 300; // 10 minutes for static routes, 5 for dynamic
  const cacheMaxAge = baseMaxAge;

  // Create a secure cache key with proper user isolation
  const userId = session?.user?.id || null;
  const timeSlot = Math.floor(Date.now() / (cacheMaxAge * 1000));

  // Use crypto hash to prevent ETag prediction and ensure uniqueness
  const cacheComponents = [
    "bombastic-cache-v2", // Updated version prefix
    url.pathname,
    userId,
    timeSlot.toString(),
    view,
    JSON.stringify(contentFilter),
    // Add static route indicator for better caching
    isStaticRoute ? "static" : "dynamic",
  ];

  const cacheHash = createHash("sha256")
    .update(cacheComponents.join("|"))
    .digest("hex")
    .substring(0, 16);

  const etag = `"${cacheHash}"`;
  const lastModified = new Date(timeSlot * cacheMaxAge * 1000);

  // Check client cache headers
  const clientEtag = request.headers.get("if-none-match");

  // 🚀 FIXED: Smart resource hints based on actual page needs
  const getResourceHints = () => {
    const hints: string[] = [];

    // Only add prefetch hints for pages that actually benefit from them
    if (url.pathname === "/") {
      // Home page: prefetch likely next destinations
      hints.push(
        "</giantbomb>; rel=prefetch; as=document",
        "</nextlander>; rel=prefetch; as=document",
      );

      // Only preload critical scripts that we know will be used
      if (session?.user) {
        hints.push("</continue>; rel=prefetch; as=document");
      }
    }

    return hints.join(", ");
  };

  // Enhanced cache headers for better performance
  if (!isDataRequest) {
    try {
      const cacheControl = session
        ? `private, max-age=${cacheMaxAge}, must-revalidate`
        : isStaticRoute
          ? `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge * 2}, immutable`
          : `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge * 2}`;

      const resourceHints = getResourceHints();

      const headers: Record<string, string> = {
        etag: etag,
        "last-modified": lastModified.toUTCString(),
        vary: "Authorization, Cookie",
        "cache-control": cacheControl,
        "x-cache-strategy": isStaticRoute ? "aggressive" : "standard",
        // Add performance hints
        "service-worker-allowed": "/",
      };

      // Only add link header if we have hints
      if (resourceHints) {
        headers.link = resourceHints;
      }

      setHeaders(headers);
    } catch {
      console.log("Cache headers already set, continuing...");
    }
  }

  // Check for cache hit
  const isCacheHit = clientEtag === etag;

  const { profile: userProfile } = await getProfile({
    session,
    supabase,
  });

  return {
    session,
    contentFilter,
    cookies: cookies.getAll(),
    userProfile,
    layout,
    // Enhanced cache metadata
    etag,
    lastModified: lastModified.toISOString(),
    cached: isCacheHit,
    cacheUserId: userId,
    // Add performance indicators
    isStaticRoute,
    cacheStrategy: isStaticRoute ? "aggressive" : "standard",
  };
};
