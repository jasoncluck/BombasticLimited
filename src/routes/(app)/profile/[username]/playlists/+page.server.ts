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
  locals: { supabase },
}) => {
  depends('supabase:db:playlistsForProfile');

  const username = params.username;

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { playlists: playlistsForUsername, count: playlistsCount } =
    await getPlaylistsForUsername({
      username,
      preferredImageFormat: 'avif',
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
  };
};
