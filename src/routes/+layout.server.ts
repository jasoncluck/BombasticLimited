import type { ContentView } from "$lib/components/content/content";
import { getFilterOptionFromQueryParams } from "$lib/components/content/content-filter";
import { getPlaylists } from "$lib/supabase/playlists";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { safeGetSession, supabase },
  cookies,
  url,
  depends,
}) => {
  depends("supabase:db:playlists");

  const { session } = await safeGetSession();
  const { playlists, count: playlistsCount } = await getPlaylists({
    session,
    supabase,
  });

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

  return {
    session,
    contentFilter,
    playlists,
    playlistsCount,
    cookies: cookies.getAll(),
    layout,
  };
};
