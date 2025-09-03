import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import { isSource } from '$lib/constants/source';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  getPlaylistsForUsername,
} from '$lib/supabase/playlists';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  params,
  depends,
  url,
  locals: { supabase },
}) => {
  depends('supabase:db:playlistsForProfile');

  const username = params.username;

  // Only sources have playlist pages - at least for now
  if (!isSource(username)) {
    redirect(303, '/');
  }

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
    playlists: playlistsForUsername,
    playlistsCount,
    currentPage,
  };
};
