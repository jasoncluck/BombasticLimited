import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPlaylists } from '$lib/supabase/playlists';
import { getProfile } from '$lib/supabase/user-profiles';

export const GET: RequestHandler = async ({ locals }) => {
  const { session, supabase } = locals;

  if (!session) {
    return json({ playlists: [], userProfile: null, userPlaylistsCount: 0 });
  }

  const [
    { userPlaylists, count: userPlaylistsCount },
    { profile: userProfile },
  ] = await Promise.all([
    getUserPlaylists({ session, supabase }),
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
