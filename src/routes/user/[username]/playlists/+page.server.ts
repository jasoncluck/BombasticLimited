import { parseImageProperties } from "$lib/components/playlist/playlist";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";
import { DEFAULT_NUM_PLAYLISTS_OVERVIEW, getPlaylistsForUsername } from "$lib/supabase/playlists";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  locals: { supabase, session },
}) => {
  depends("supabase:db:playlists");

  const username = params.username


  const { playlists } = await parent();

  const followedPlaylists = playlists.filter((p) => p.created_by !== session?.user.id)


  const { playlists: playlistsForUsername } = await getPlaylistsForUsername({ username, limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW, supabase });

  for (const playlist of playlistsForUsername) {
    playlist.processedImageUrl = await getCroppedPlaylistImageUrlServer({
      imageProperties: parseImageProperties(playlist.image_properties),
      thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
      thumbnailUrl: playlist.thumbnail_url,
    });
  }


  return {
    playlistsForUsername,
    playlists,
    followedPlaylists,
  };
};
