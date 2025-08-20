import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPlaylists } from '$lib/supabase/playlists';
import { getProfile } from '$lib/supabase/user-profiles';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';

export const GET: RequestHandler = async ({ locals, request }) => {
  const { session, supabase } = locals;
  const acceptHeader = request.headers.get('accept');

  // Detect optimal image format from Accept header
  const preferredImageFormat = detectOptimalFormat(acceptHeader);

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

  return json(
    {
      playlists: userPlaylists ?? [],
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
