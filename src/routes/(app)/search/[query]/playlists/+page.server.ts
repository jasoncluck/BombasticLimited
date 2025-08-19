import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from '$lib/supabase/playlists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  depends,
  params,
  url,
  locals: { supabase, session },
  request,
}) => {
  depends('supabase:db:playlistsForProfile');

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const searchString = params.query;
  const acceptHeader = request.headers.get('accept');

  const { playlists: playlistResults, count: playlistsCount } =
    await searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      supabase,
      session,
      acceptHeader,
    });

  // Return playlists directly with optimized image paths from database
  // The new playlist-image component will handle fallback and processing
  return {
    playlistResults, // No longer need client-side processedImageUrl
    playlistsCount,
    currentPage,
  };
};
