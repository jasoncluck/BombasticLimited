import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  getPlaylistsForUsername,
} from '$lib/supabase/playlists';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';
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

  // Process playlists server-side (similar to [source] route)
  const processedPlaylists = await Promise.all(
    playlistsForUsername.map(async (playlist) => ({
      ...playlist,
      processedImageUrl: await getCroppedPlaylistImageUrlServer({
        imageProperties: parseImageProperties(playlist.image_properties),
        thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
        thumbnailUrl: playlist.thumbnail_url,
      }),
    }))
  );

  return {
    processedPlaylists, // Return processed playlists instead of raw data
    playlistsCount,
    currentPage,
  };
};
