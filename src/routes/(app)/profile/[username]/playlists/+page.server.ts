import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  getPlaylistsForUsername,
} from '$lib/supabase/playlists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  params,
  depends,
  url,
  locals: { supabase, session },
  setHeaders,
  isDataRequest,
  request,
}) => {
  depends('supabase:db:playlistsForProfile');

  const username = params.username;

  // Add 2-minute caching headers
  const userId = session?.user?.id || null;
  const timeSlot = Math.floor(Date.now() / 120000); // 2 minute slots (120 seconds)

  const cacheKey = `playlists-${username}-${userId || 'anon'}-${timeSlot}`;
  const etag = `"${cacheKey}"`;
  const lastModified = new Date(timeSlot * 120000);

  const clientEtag = request.headers.get('if-none-match');

  if (!isDataRequest) {
    try {
      const cacheControl = session
        ? 'private, max-age=120, must-revalidate'
        : 'public, max-age=120, s-maxage=240';

      setHeaders({
        etag: etag,
        'last-modified': lastModified.toUTCString(),
        'cache-control': cacheControl,
        vary: 'Authorization, Cookie',
      });
    } catch {
      // Headers already set
    }
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { playlists: playlistsForUsername, count: playlistsCount } =
    await getPlaylistsForUsername({
      username,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      supabase,
    });

  // Return playlists directly with optimized image paths from database
  // The new playlist-image component will handle fallback and processing
  return {
    processedPlaylists: playlistsForUsername, // No longer need client-side processedImageUrl
    playlistsCount,
    currentPage,
    supabase, // Pass supabase client to component
    session,
  };
};
