import type { ContentView } from "$lib/components/content/content";
import { getFilterOptionFromQueryParams } from "$lib/components/content/content-filter";
import { parseImageProperties } from "$lib/components/playlist/playlist";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";
import { getUserPlaylists } from "$lib/supabase/playlists";
import { getProfile } from "$lib/supabase/profiles";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { safeGetSession, supabase },
  cookies,
  url,
  depends,
}) => {
  depends("supabase:db:playlists");

  const { session } = await safeGetSession();
  const { userPlaylists, count: userPlaylistsCount } = await getUserPlaylists({
    session,
    supabase,
  });

  const { profile: userProfile } = await getProfile({ supabase, session })

  if (userPlaylists) {
    for (const userPlaylist of userPlaylists) {

      userPlaylist.processedImageUrl = await getCroppedPlaylistImageUrlServer({
        imageProperties: parseImageProperties(userPlaylist.image_properties),
        thumbnailMaxResUrl: userPlaylist.thumbnail_maxres_url,
        thumbnailUrl: userPlaylist.thumbnail_url,
      });
    }
  }

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
    playlists: userPlaylists ?? [],
    userPlaylistsCount: userPlaylistsCount ?? 0,
    userProfile,
    cookies: cookies.getAll(),
    layout,
  };
};
