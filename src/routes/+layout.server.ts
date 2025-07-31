import type { ContentView } from "$lib/components/content/content";
import { getFilterOptionFromQueryParams } from "$lib/components/content/content-filter";
import { getProfile } from "$lib/supabase/user-profiles";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { safeGetSession, supabase },
  cookies,
  url,
  isDataRequest,
  setHeaders,
  depends,
}) => {
  depends("supabase:db:profiles");
  // Start session fetch and process synchronous operations in parallel
  const sessionPromise = safeGetSession();

  // Process synchronous operations while session is being fetched
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
    layout = JSON.parse(layout);
  }

  const { session } = await sessionPromise;
  const cacheMaxAge = 300; // 5 minutes

  // Create a cache key that includes relevant factors
  const cacheKey = [
    "videos",
    session ? session.user.id : "anonymous",
    Math.floor(Date.now() / (cacheMaxAge * 1000)), // Changes every cache period
  ].join("-");

  if (!isDataRequest) {
    setHeaders({
      // Public cache for anonymous users, private for authenticated
      "cache-control": session
        ? `private, max-age=${cacheMaxAge}`
        : `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}`,
      vary: "Accept-Encoding, Authorization",
      etag: `"${cacheKey}"`,
      // Add last-modified header
      "last-modified": new Date(
        Math.floor(Date.now() / (cacheMaxAge * 1000)) * cacheMaxAge * 1000,
      ).toUTCString(),
    });
  }

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
    // Remove sidebar data from here - will be loaded client-side
  };
};
