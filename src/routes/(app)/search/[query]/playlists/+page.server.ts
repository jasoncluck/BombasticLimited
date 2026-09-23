import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from '$lib/neon/playlists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  depends,
  params,
  parent,
  url,
  locals: { neon, userId },
}) => {
  depends('neon:db:playlistsForProfile');

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { preferredImageFormat, userProfile } = await parent();

  const searchString = params.query;

  const { playlists: playlistResults, count: playlistsCount } =
    await searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      neon,
      userId,
      preferredImageFormat,
      enabledSources: userProfile?.sources,
    });

  // Return playlists directly with optimized image paths from database
  // The new playlist-image component will handle fallback and processing
  return {
    playlistResults, // No longer need client-side processedImageUrl
    playlistsCount,
    currentPage,
  };
};
