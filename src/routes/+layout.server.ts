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

  // Optimized cache settings - more aggressive for static routes
  const isStaticRoute = [
    "/giantbomb",
    "/nextlander",
    "/remap",
    "/jeffgerstmann",
  ].includes(url.pathname);

  // Longer cache times for better performance
  const baseMaxAge = isStaticRoute ? 900 : 600; // 15 minutes static, 10 minutes dynamic
  const cacheMaxAge = baseMaxAge;

  // Simplified cache key generation
  const userId = session?.user?.id || null;
  const timeSlot = Math.floor(Date.now() / (cacheMaxAge * 1000));

  const cacheComponents = [
    "bombastic-cache-v3", // Updated version
    url.pathname,
    userId || "anonymous",
    timeSlot.toString(),
    view,
    // Simplified filter serialization
    Object.keys(contentFilter).length > 0
      ? JSON.stringify(contentFilter)
      : "none",
    isStaticRoute ? "static" : "dynamic",
  ];

  const cacheHash = createHash("sha256")
    .update(cacheComponents.join("|"))
    .digest("hex")
    .substring(0, 16);

  const etag = `"${cacheHash}"`;
  const lastModified = new Date(timeSlot * cacheMaxAge * 1000);

  const clientEtag = request.headers.get("if-none-match");

  // Simplified resource hints - only for home page
  const getResourceHints = () => {
    if (url.pathname === "/") {
      const hints = [
        "</giantbomb>; rel=prefetch; as=document",
        "</nextlander>; rel=prefetch; as=document",
      ];

      if (session?.user) {
        hints.push("</continue>; rel=prefetch; as=document");
      }

      return hints.join(", ");
    }
    return "";
  };

  // Optimized cache headers
  if (!isDataRequest) {
    try {
      const cacheControl = session
        ? `private, max-age=${cacheMaxAge}, must-revalidate`
        : isStaticRoute
          ? `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge * 3}, immutable`
          : `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge * 2}`;

      const resourceHints = getResourceHints();

      const headers: Record<string, string> = {
        etag: etag,
        "last-modified": lastModified.toUTCString(),
        vary: "Authorization, Cookie",
        "cache-control": cacheControl,
        "x-cache-strategy": isStaticRoute ? "aggressive" : "standard",
        "service-worker-allowed": "/",
        // Add performance hints
        "x-robots-tag": "noindex, nofollow", // Prevent search engine caching conflicts
      };

      if (resourceHints) {
        headers.link = resourceHints;
      }

      setHeaders(headers);
    } catch {
      // Headers already set
    }
  }

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
    etag,
    lastModified: lastModified.toISOString(),
    cached: isCacheHit,
    cacheUserId: userId,
    isStaticRoute,
    cacheStrategy: isStaticRoute ? "aggressive" : "standard",
  };
};
