import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPlaylists } from '$lib/supabase/playlists';
import { getProfile } from '$lib/supabase/user-profiles';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

export const GET: RequestHandler = async ({ locals }) => {
  const { session, supabase } = locals;

  if (!session) {
    return json({ playlists: [], userProfile: null, userPlaylistsCount: 0 });
  }

  // Run getUserPlaylists and getProfile concurrently
  const [
    { userPlaylists, count: userPlaylistsCount },
    { profile: userProfile },
  ] = await Promise.all([
    getUserPlaylists({ session, supabase }),
    getProfile({ supabase, session }),
  ]);

  // Process playlist images concurrently if playlists exist
  let processedPlaylists = userPlaylists;
  if (userPlaylists) {
    const playlistImagePromises = userPlaylists.map(async (userPlaylist) => ({
      ...userPlaylist,
      processedImageUrl: await getCroppedPlaylistImageUrlServer({
        imageProperties: parseImageProperties(userPlaylist.image_properties),
        thumbnailMaxResUrl: userPlaylist.thumbnail_maxres_url,
        thumbnailUrl: userPlaylist.thumbnail_url,
      }),
    }));

    processedPlaylists = await Promise.all(playlistImagePromises);
  }

  return json({
    playlists: processedPlaylists ?? [],
    userProfile,
    userPlaylistsCount: userPlaylistsCount ?? 0,
  });
};
