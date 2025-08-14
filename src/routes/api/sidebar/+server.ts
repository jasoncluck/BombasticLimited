import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPlaylists } from '$lib/supabase/playlists';
import { getProfile } from '$lib/supabase/user-profiles';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { generatePlaylistImageUrl } from '$lib/server/image-processing';

export const GET: RequestHandler = async ({ locals, request }) => {
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

  // Generate playlist image URLs instead of processing inline
  let processedPlaylists = userPlaylists;
  if (userPlaylists) {
    processedPlaylists = userPlaylists.map((userPlaylist) => ({
      ...userPlaylist,
      processedImageUrl: generatePlaylistImageUrl({
        imageProperties: parseImageProperties(userPlaylist.image_properties),
        thumbnailMaxResUrl: userPlaylist.thumbnail_maxres_url,
        thumbnailUrl: userPlaylist.thumbnail_url,
        format: 'auto', // Enable AVIF format detection
        quality: 90,
      }),
    }));
  }

  return json(
    {
      playlists: processedPlaylists ?? [],
      userProfile,
      userPlaylistsCount: userPlaylistsCount ?? 0,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
};
