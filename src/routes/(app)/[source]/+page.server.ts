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
  parseImageProperties,
} from '$lib/supabase/playlists';
import type { PageServerLoad } from './$types';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  locals: { supabase },
}) => {
  depends('supabase:db:videos');

  const source = params.source;

  if (!isSource(source)) {
    redirect(303, '/');
  }

  const { contentFilter, preferredImageFormat } = await parent();

  if (!isVideoFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  const playlistContentFilter: PlaylistVideosFilter = {
    sort: { key: 'playlistOrder', order: 'ascending' },
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
        preferredImageFormat,
      }).then((result) => result.videos),

      await Promise.all(
        SOURCE_INFO[source].highlightedPlaylists.map(
          async (highlightPlaylist) => {
            const { playlist, videos } = await getPlaylistDataByYoutubeId({
              youtubeId: highlightPlaylist.youtubeId,
              contentFilter: playlistContentFilter,
              limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW,
              supabase,
              preferredImageFormat,
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
        preferredImageFormat,
      }),
    ]);

  // Filter out null results from highlight playlists
  const highlightPlaylists = highlightPlaylistsResults.filter(
    (result) => result !== null
  );

  // Process image URLs in parallel
  const sourcePlaylists = await Promise.all(
    sourcePlaylistsData.playlists.map(async (sp) => {
      if (!sp.image_url) {
        sp.image_url = await getCroppedPlaylistImageUrlServer({
          thumbnailUrl: sp.thumbnail_url ?? undefined,
          imageProperties: parseImageProperties(sp.image_properties),
        });
      }
      return sp;
    })
  );

  // Return playlists directly with optimized image paths from database
  // The new playlist-image component will handle fallback and processing
  return {
    videos: videos ?? [],
    highlightPlaylists,
    playlistContentFilter,
    sourcePlaylists: sourcePlaylists,
    source,
    contentFilter,
  };
};
