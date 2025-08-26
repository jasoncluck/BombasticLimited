import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getUserPlaylists,
  parseImageProperties,
} from '$lib/supabase/playlists';
import { getProfile } from '$lib/supabase/user-profiles';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

interface RequestBody {
  preferredImageFormat?: string;
}

export const POST: RequestHandler = async ({ locals, request }) => {
  const { session, supabase } = locals;

  // Parse the request body
  const body: RequestBody = await request.json();
  const preferredImageFormat =
    body.preferredImageFormat ??
    detectOptimalFormat(request.headers.get('accept') || '');

  if (!session) {
    return json({ playlists: [], userProfile: null, userPlaylistsCount: 0 });
  }

  const [
    { userPlaylists, count: userPlaylistsCount },
    { profile: userProfile },
  ] = await Promise.all([
    getUserPlaylists({ session, supabase, preferredImageFormat }),
    getProfile({ supabase, session }),
  ]);

  // Process image URLs in parallel
  const playlistsWithImages = await Promise.all(
    userPlaylists.map(async (up) => {
      if (!up.image_url) {
        up.image_url = await getCroppedPlaylistImageUrlServer({
          thumbnailUrl: up.thumbnail_url ?? null,
          imageProperties: parseImageProperties(up.image_properties),
        });
      }
      return up;
    })
  );

  return json(
    {
      playlists: playlistsWithImages ?? [],
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
