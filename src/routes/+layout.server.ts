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
  const cacheMaxAge = 300; // 5 minutes

  // Create a secure cache key with proper user isolation
  const userId = session?.user?.id || "anonymous";
  const timeSlot = Math.floor(Date.now() / (cacheMaxAge * 1000));

  // Use crypto hash to prevent ETag prediction and ensure uniqueness
  const cacheComponents = [
    "bombastic-cache-v1", // Version prefix
    url.pathname,
    userId,
    timeSlot.toString(),
    // Add any other factors that affect the response
    view,
    JSON.stringify(contentFilter),
  ];

  const cacheHash = createHash("sha256")
    .update(cacheComponents.join("|"))
    .digest("hex")
    .substring(0, 16); // Use first 16 chars for shorter ETag

  const etag = `"${cacheHash}"`;
  const lastModified = new Date(timeSlot * cacheMaxAge * 1000);

  // Check client cache headers
  const clientEtag = request.headers.get("if-none-match");

  // Set secure cache headers
  if (!isDataRequest) {
    try {
      setHeaders({
        // Always use private cache for user-specific data
        etag: etag,
        "last-modified": lastModified.toUTCString(),
        vary: "Authorization, Cookie",
        // Add security headers
        "cache-control": session
          ? `private, max-age=${cacheMaxAge}, must-revalidate`
          : `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}`,
      });
    } catch {
      console.log("Cache headers already set, continuing...");
    }
  }

  // Check for cache hit (but still return full data for security)
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
    // Secure cache metadata
    etag,
    lastModified: lastModified.toISOString(),
    cached: isCacheHit,
    // Add user context for client-side validation
    cacheUserId: userId,
  };
};
