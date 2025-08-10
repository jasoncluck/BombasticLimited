import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from '$lib/supabase/playlists';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';
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

  // Get Accept header for optimal format detection
  const acceptHeader = request.headers.get('accept');

  const { playlists: playlistResults, count: playlistsCount } =
    await searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      supabase,
      session,
    });

  // Process playlist images server-side with AVIF format detection
  const processedPlaylistResults = await Promise.all(
    playlistResults.map(async (playlist) => ({
      ...playlist,
      processedImageUrl: await getCroppedPlaylistImageUrlServer({
        imageProperties: parseImageProperties(playlist.image_properties),
        thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
        thumbnailUrl: playlist.thumbnail_url,
        acceptHeader,
        options: { format: 'auto' },
      }),
    }))
  );

  return {
    playlistResults: processedPlaylistResults,
    playlistsCount,
    currentPage,
  };
};
