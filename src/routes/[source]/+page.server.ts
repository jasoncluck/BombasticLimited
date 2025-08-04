import { isSource, SOURCE_INFO } from '$lib/constants/source';
import { DEFAULT_NUM_VIDEOS_OVERVIEW, getVideos } from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import {
  isVideoFilter,
  type PlaylistVideosFilter,
} from '$lib/components/content/content-filter';
import {
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  getPlaylistDataByYoutubeId,
  getPlaylistsForUsername,
} from '$lib/supabase/playlists';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  locals: { supabase, session },
  setHeaders,
  isDataRequest,
  request,
}) => {
  depends('supabase:db:videos');

  const source = params.source;

  if (!isSource(source)) {
    redirect(303, '/');
  }

  const { contentFilter } = await parent();

  if (!isVideoFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  // Add 2-minute caching headers
  const userId = session?.user?.id || null;
  const timeSlot = Math.floor(Date.now() / 120000); // 2 minute slots (120 seconds)

  const cacheKey = `${source}-${userId || 'anon'}-${timeSlot}`;
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

  const playlistContentFilter: PlaylistVideosFilter = {
    sort: { key: 'datePublished', order: 'descending' },
    type: 'playlist',
  };

  // Run all major operations in parallel
  const [videos, highlightPlaylistsResults, sourcePlaylistsData] =
    await Promise.all([
      // Get videos for the source
      getVideos({
        source,
        limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
        contentFilter,
        supabase,
      }).then((result) => result.videos),

      // Get all highlighted playlists using the enhanced function
      Promise.all(
        SOURCE_INFO[source].highlightedPlaylists.map(
          async (highlightPlaylist) => {
            const { playlist, videos } = await getPlaylistDataByYoutubeId({
              youtubeId: highlightPlaylist.youtubeId,
              contentFilter: playlistContentFilter,
              limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
              supabase,
              session,
            });

            if (!playlist) {
              return null;
            }

            // Override playlist name
            playlist.name = highlightPlaylist.name;

            return { playlist, videos };
          }
        )
      ),

      // Get source playlists data
      getPlaylistsForUsername({
        username: source,
        limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW,
        supabase,
      }),
    ]);

  // Filter out null results from highlight playlists
  const highlightPlaylists = highlightPlaylistsResults.filter(
    (result) => result !== null
  );

  // Process source playlists server-side (similar to search route)
  const processedSourcePlaylists = await Promise.all(
    sourcePlaylistsData.playlists.map(async (playlist) => ({
      ...playlist,
      processedImageUrl: await getCroppedPlaylistImageUrlServer({
        imageProperties: parseImageProperties(playlist.image_properties),
        thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
        thumbnailUrl: playlist.thumbnail_url,
      }),
    }))
  );

  return {
    videos: videos ?? [],
    highlightPlaylists,
    processedSourcePlaylists, // Return processed playlists instead of raw data
    source,
    contentFilter,
  };
};
