import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from '$lib/supabase/playlists';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { generatePlaylistImageUrl } from '$lib/server/image-processing';
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

  const { playlists: playlistResults, count: playlistsCount } =
    await searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      supabase,
      session,
    });

  // Generate playlist image URLs instead of processing inline
  const processedPlaylistResults = playlistResults.map((playlist) => ({
    ...playlist,
    processedImageUrl: generatePlaylistImageUrl({
      imageProperties: parseImageProperties(playlist.image_properties),
      thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
      thumbnailUrl: playlist.thumbnail_url,
      format: 'auto', // Enable AVIF format detection
      quality: 90,
    }),
  }));

  return {
    playlistResults: processedPlaylistResults,
    playlistsCount,
    currentPage,
  };
};
