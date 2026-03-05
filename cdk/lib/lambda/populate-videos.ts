import { youtube, youtube_v3 } from '@googleapis/youtube';
import { createClient } from '@supabase/supabase-js';
import { CHANNEL_INFO, ChannelSource } from '../channel';

const MAX_RESULTS = 50;
const DEFAULT_NUM_PAGES = 2;

// Helper function to get the highest resolution thumbnail available
const getBestThumbnailUrl = (
  thumbnails?: youtube_v3.Schema$ThumbnailDetails | null
): string | null | undefined => {
  if (!thumbnails) return null;

  // Prioritize maxres for image processing pipeline, then fallback to other resolutions. Only using 16:9 to avoid black bars on the bottom and top
  // https://developers.google.com/youtube/v3/docs/thumbnails
  const candidates = [
    thumbnails.maxres?.url, // 1280x720 (highest quality for processing)
    thumbnails.medium?.url, // 320x180
    thumbnails.default?.url, // 120x90
  ];

  return candidates.find((url) => url) || null;
};

// Helper to remove "_live" suffix from thumbnail URLs

export const populateVideos = async ({
  source,
  repopulate = false,
}: {
  source: ChannelSource;
  repopulate: boolean;
}) => {
  const supabaseApiKey = process.env.SUPABASE_SERVICE_API_KEY;
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  if (!supabaseApiKey || !supabaseUrl) {
    const errMsg = 'Could not find Supabase env.';
    console.error(JSON.stringify({ stage: 'init', error: errMsg }));
    throw new Error(errMsg);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseApiKey);

  if (!source) {
    const errMsg = 'Request body must contain the source of the content.';
    console.error(JSON.stringify({ stage: 'init', error: errMsg }));
    throw new Error(errMsg);
  }
  const { uploadPlaylistId } = CHANNEL_INFO[source];

  const youtubeClient = youtube({
    version: 'v3',
    auth: process.env.GOOGLE_API_KEY,
  });

  let curPage = 1;
  const videosToCheck = repopulate
    ? Number.MAX_SAFE_INTEGER
    : DEFAULT_NUM_PAGES * MAX_RESULTS;

  const youtubeVideoIds = new Set<string>();

  try {
    // Step 1: Fetch ALL videos from YouTube first (no pre-marking of videos for deletion)
    let pageToken: string | null | undefined;
    do {
      let items: youtube_v3.Schema$PlaylistItem[] | undefined;
      try {
        const { data } = await youtubeClient.playlistItems.list({
          part: ['id', 'snippet', 'contentDetails'],
          playlistId: uploadPlaylistId,
          maxResults: 50,
          ...(pageToken && { pageToken }),
        });

        ({ nextPageToken: pageToken, items } = data);

        if (!items) {
          throw new Error(
            `No items found for: ${source}, stopping. PlaylistID: ${uploadPlaylistId}`
          );
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            stage: 'fetch_youtube_playlist_items',
            source,
            playlistId: uploadPlaylistId,
            error: e,
          })
        );
        throw e;
      }

      // Extract video IDs and fetch additional details including duration
      const videoIds = items
        .map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => !!id);

      // Track all video IDs returned by YouTube
      videoIds.forEach((id) => youtubeVideoIds.add(id));

      let videoDetails: { id: string; duration: string }[] = [];
      if (videoIds.length > 0) {
        try {
          const { data: videoData } = await youtubeClient.videos.list({
            part: ['id', 'contentDetails'],
            id: videoIds,
          });
          videoDetails =
            videoData.items?.map((video) => {
              if (!video.id || !video.contentDetails?.duration) {
                throw new Error(
                  'Unexpected error - could not find duration of a video.'
                );
              }
              return {
                id: video.id,
                duration: video.contentDetails.duration,
              };
            }) ?? [];
        } catch (e) {
          console.error(
            JSON.stringify({
              stage: 'fetch_youtube_video_details',
              source,
              videoIds,
              error: e,
            })
          );
          throw e;
        }
      }

      const videos = items.map((item) => {
        const videoDetail = videoDetails.find(
          (v) => v.id === item.contentDetails?.videoId
        );
        return {
          id: item.contentDetails?.videoId,
          source: source,
          title: item.snippet?.title,
          description: item.snippet?.description,
          published_at: item.snippet?.publishedAt,
          thumbnail_url: getBestThumbnailUrl(item.snippet?.thumbnails),
          duration: videoDetail?.duration,
          pending_delete: false, // All YouTube videos are current
        };
      });

      console.log(videos);

      // Batch upsert for better performance
      const { error } = await supabaseClient
        .from('videos')
        .upsert(videos, { onConflict: 'id' });

      if (error) {
        console.error(
          JSON.stringify({
            stage: 'batch_upsert_videos',
            source,
            error,
          })
        );
        throw error;
      } else {
        console.log(
          JSON.stringify({
            stage: 'batch_upsert_videos',
            message: `Upserted ${videos.length} videos for source: ${source}`,
            videoIds: videos.map((v) => v.id),
          })
        );
      }

      if (repopulate || curPage <= DEFAULT_NUM_PAGES) {
        curPage++;
        if (!repopulate && curPage > DEFAULT_NUM_PAGES) {
          break;
        }
      }
    } while (pageToken);

    console.log(
      JSON.stringify({
        stage: 'youtube_fetch_complete',
        message: `Fetched ${youtubeVideoIds.size} videos from YouTube`,
        source,
        syncType: repopulate ? 'full_repopulate' : 'partial_sync',
      })
    );

    // Step 2: Now mark videos for deletion based on what YouTube actually returned
    let videosToMarkForDeletion: string[] = [];

    if (repopulate) {
      // Full repopulate: Check ALL videos in DB against YouTube response
      const { data: allVideos, error } = await supabaseClient
        .from('videos')
        .select('id')
        .eq('source', source);

      if (error) {
        console.error(
          JSON.stringify({
            stage: 'fetch_all_videos_for_comparison',
            source,
            error,
          })
        );
        throw new Error('Failed to fetch all videos for comparison');
      }

      // Find videos in DB that are NOT in YouTube response
      videosToMarkForDeletion = (allVideos || [])
        .map((v) => v.id)
        .filter((id) => !youtubeVideoIds.has(id));
    } else {
      // Partial sync: Only check recent videos against YouTube response
      const { data: recentVideos, error } = await supabaseClient
        .from('videos')
        .select('id')
        .eq('source', source)
        .order('published_at', { ascending: false })
        .limit(videosToCheck);

      if (error) {
        console.error(
          JSON.stringify({
            stage: 'fetch_recent_videos_for_comparison',
            source,
            error,
          })
        );
        throw new Error('Failed to fetch recent videos for comparison');
      }

      // Find recent videos in DB that are NOT in YouTube response
      videosToMarkForDeletion = (recentVideos || [])
        .map((v) => v.id)
        .filter((id) => !youtubeVideoIds.has(id));
    }

    // Step 3: Mark videos for deletion only if they're confirmed to not exist in YouTube
    if (videosToMarkForDeletion.length > 0) {
      const { error: markError } = await supabaseClient
        .from('videos')
        .update({ pending_delete: true })
        .eq('source', source)
        .in('id', videosToMarkForDeletion);

      if (markError) {
        console.error(
          JSON.stringify({
            stage: 'mark_videos_for_deletion',
            source,
            videoIds: videosToMarkForDeletion,
            error: markError,
          })
        );
        throw new Error('Failed to mark videos for deletion');
      }

      console.log(
        JSON.stringify({
          stage: 'mark_videos_for_deletion',
          message: `Marked ${videosToMarkForDeletion.length} videos for deletion (not found in YouTube response)`,
          source,
          videoIds: videosToMarkForDeletion,
        })
      );
    }

    // Step 4: Get details of videos to be deleted and actually delete them
    const { data: videosToDelete, error: queryError } = await supabaseClient
      .from('videos')
      .select('id, title')
      .eq('source', source)
      .eq('pending_delete', true);

    if (queryError) {
      console.error(
        JSON.stringify({
          stage: 'query_videos_to_delete',
          source,
          error: queryError,
        })
      );
      throw new Error('Failed to query videos marked for deletion');
    }

    const deletionCandidates = videosToDelete || [];

    // Actually delete the videos
    if (deletionCandidates.length > 0) {
      const { error: deleteError } = await supabaseClient
        .from('videos')
        .delete()
        .eq('source', source)
        .eq('pending_delete', true);

      if (deleteError) {
        console.error(
          JSON.stringify({
            stage: 'delete_videos',
            source,
            error: deleteError,
          })
        );
        throw new Error('Failed to delete videos marked as pending_delete');
      }

      console.log(
        JSON.stringify({
          stage: 'cleanup_complete',
          message: `Processed ${youtubeVideoIds.size} videos from YouTube, deleted ${deletionCandidates.length} stale videos`,
          source,
          syncType: repopulate ? 'full_repopulate' : 'partial_sync',
          deletedVideos: deletionCandidates.map((v) => ({
            id: v.id,
            title: v.title,
          })),
        })
      );
    } else {
      console.log(
        JSON.stringify({
          stage: 'no_deletions_needed',
          message: `All videos are current. Processed ${youtubeVideoIds.size} videos from YouTube, no deletions needed.`,
          source,
          syncType: repopulate ? 'full_repopulate' : 'partial_sync',
        })
      );
    }
  } catch (e) {
    // Final catch-all for unhandled errors
    console.error(
      JSON.stringify({
        stage: 'final',
        source,
        error: e instanceof Error ? e.message : e,
        stack: e instanceof Error ? e.stack : undefined,
      })
    );
    throw e; // Rethrow to signal Lambda failure
  }
};
