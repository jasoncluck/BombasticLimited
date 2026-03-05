import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from '$lib/supabase/playlists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  depends,
  params,
  parent,
  url,
  locals: { supabase },
}) => {
  depends('supabase:db:playlistsForProfile');

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { preferredImageFormat } = await parent();

  const searchString = params.query;

  const { playlists: playlistResults, count: playlistsCount } =
    await searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      supabase,
      preferredImageFormat,
    });

  // Return playlists directly with optimized image paths from database
  // The new playlist-image component will handle fallback and processing
  return {
    playlistResults, // No longer need client-side processedImageUrl
    playlistsCount,
    currentPage,
  };
};
