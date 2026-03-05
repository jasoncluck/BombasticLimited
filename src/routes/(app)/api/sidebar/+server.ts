import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getUserPlaylists,
  parseImageProperties,
} from '$lib/supabase/playlists';
import { getProfile } from '$lib/supabase/user-profiles';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';
import { getActiveStreams } from '$lib/supabase/streams';

interface RequestBody {
  preferredImageFormat?: string;
}

export const POST: RequestHandler = async ({ locals, request }) => {
  const { supabase } = locals;

  // Parse the request body
  const body: RequestBody = await request.json();
  const preferredImageFormat =
    body.preferredImageFormat ??
    detectOptimalFormat(request.headers.get('accept') || '');

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    const [{ sources }] = await Promise.all([getActiveStreams({ supabase })]);
    return json({
      playlists: [],
      userProfile: null,
      userPlaylistsCount: 0,
      streamingSources: sources,
    });
  }

  const [
    { userPlaylists, count: userPlaylistsCount },
    { profile: userProfile },
    { sources },
  ] = await Promise.all([
    getUserPlaylists({ supabase, preferredImageFormat }),
    getProfile({ supabase }),
    getActiveStreams({ supabase }),
  ]);

  // Process image URLs in parallel
  const playlistsWithImages = await Promise.all(
    userPlaylists.map(async (up) => {
      if (!up.image_url) {
        up.image_url = await getCroppedPlaylistImageUrlServer({
          thumbnailUrl: up.thumbnail_url ?? undefined,
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
      streamingSources: sources ?? [],
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
