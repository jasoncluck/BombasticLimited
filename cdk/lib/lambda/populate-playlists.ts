import { youtube, youtube_v3 } from '@googleapis/youtube';
import { createClient } from '@supabase/supabase-js';
import { CHANNEL_INFO, ChannelSource } from '../channel';

const MAX_RESULTS = 5; // Reduced from 50 since playlists are not added frequently

/**
 * Queue image processing for a playlist thumbnail using database jobs
 * This follows the same pattern as the main app's image processing system
 */
async function queuePlaylistThumbnailProcessing(
  supabaseClient: any, // Use any to avoid complex typing issues in Lambda context
  playlistId: number,
  thumbnailUrl: string | null,
  priority: number = 100
): Promise<void> {
  if (!thumbnailUrl) {
    console.log(
      JSON.stringify({
        stage: 'queue_image_processing',
        message: `No thumbnail URL provided for playlist ${playlistId}, skipping image processing`,
        playlistId,
      })
    );
    return;
  }

  console.log(
    JSON.stringify({
      stage: 'queue_image_processing',
      message: `Queuing image processing for playlist ${playlistId}`,
      playlistId,
      thumbnailUrl,
    })
  );

  try {
    const { data: jobId, error } = await supabaseClient.rpc(
      'queue_image_processing_job',
      {
        p_entity_type: 'playlist',
        p_entity_id: playlistId.toString(),
        p_image_type: 'playlist_image',
        p_source_url: thumbnailUrl,
        p_priority: priority,
      }
    );

    if (error) {
      console.error(
        JSON.stringify({
          stage: 'queue_image_processing',
          error,
          message: `Failed to queue image processing for playlist ${playlistId}`,
          playlistId,
          thumbnailUrl,
        })
      );
      // Don't throw here - image processing failure shouldn't break playlist sync
      return;
    }

    if (jobId) {
      console.log(
        JSON.stringify({
          stage: 'queue_image_processing',
          message: `Successfully queued image processing job for playlist ${playlistId}`,
          playlistId,
          jobId,
        })
      );
    } else {
      console.log(
        JSON.stringify({
          stage: 'queue_image_processing',
          message: `Image processing job skipped for playlist ${playlistId} - duplicate or recently completed`,
          playlistId,
        })
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        stage: 'queue_image_processing',
        error: error instanceof Error ? error.message : error,
        message: `Exception while queuing image processing for playlist ${playlistId}`,
        playlistId,
        thumbnailUrl,
      })
    );
    // Don't throw here - image processing failure shouldn't break playlist sync
  }
}

// Helper function to get the highest resolution thumbnail available
const getBestThumbnailUrl = (
  thumbnails?: youtube_v3.Schema$ThumbnailDetails | null
): string | null => {
  if (!thumbnails) return null;

  // Prioritize maxres for image processing pipeline, then fallback to other resolutions
  const candidates = [
    thumbnails.maxres?.url, // 1280x720 (highest quality for processing)
    thumbnails.standard?.url, // 640x480
    thumbnails.high?.url, // 480x360
    thumbnails.medium?.url, // 320x180
    thumbnails.default?.url, // 120x90
  ];

  return candidates.find((url) => url) || null;
};

// Helper to remove "_live" suffix from thumbnail URLs (same as in video processing)
const removeLiveSuffix = (url?: string | null): string | null | undefined =>
  url ? url.replace(/_live(\.\w+)$/, '$1') : url;

export const populatePlaylists = async ({
  source,
}: {
  source: ChannelSource;
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

  if (!CHANNEL_INFO[source]) {
    throw new Error(
      `Invalid source: ${source}. Valid sources are: ${Object.keys(CHANNEL_INFO).join(', ')}`
    );
  }

  const { id: channelId, uploadPlaylistId } = CHANNEL_INFO[source];
  if (!channelId) {
    const errMsg = `channelId not found for source: ${source}`;
    console.error(JSON.stringify({ stage: 'init', source, error: errMsg }));
    throw new Error(errMsg);
  }

  try {
    const email = `${source}@bombastic.ltd`;
    const username = source;
    const defaultPassword = require('crypto').randomBytes(32).toString('hex');

    // Call the create_user function which handles both creation and existing user cases
    const { data: userId, error: createUserError } = await supabaseClient.rpc(
      'create_user',
      {
        email,
        password: defaultPassword,
        username,
      }
    );

    if (createUserError) {
      console.error(
        JSON.stringify({
          stage: 'create_or_get_user',
          source,
          error: createUserError,
          message: `Failed to create or get user for source: ${source}`,
        })
      );
      throw new Error(
        `Failed to create or get user for source: ${source}: ${createUserError.message}`
      );
    }

    if (!userId) {
      console.error(
        JSON.stringify({
          stage: 'create_or_get_user',
          source,
          error: 'No user ID returned',
          message: `No user ID returned for source: ${source}`,
        })
      );
      throw new Error(`No user ID returned for source: ${source}`);
    }

    console.log(
      JSON.stringify({
        stage: 'user_handled',
        message: `Successfully handled user for source: ${source}`,
        userId,
      })
    );

    const youtubeClient = youtube({
      version: 'v3',
      auth: process.env.GOOGLE_API_KEY,
    });

    const youtubePlaylistIds = new Set<string>();

    // Step 1: Fetch ALL playlists from YouTube first (excluding uploads playlist)
    let pageToken: string | null | undefined;
    let totalPlaylistsProcessed = 0;
    let uploadsPlaylistSkipped = false;

    do {
      let items: youtube_v3.Schema$Playlist[] | undefined;
      try {
        const { data } = await youtubeClient.playlists.list({
          part: ['id', 'snippet'],
          channelId,
          maxResults: MAX_RESULTS,
          ...(pageToken && { pageToken }),
        });

        ({ nextPageToken: pageToken, items } = data);

        if (!items || items.length === 0) {
          console.log(
            JSON.stringify({
              stage: 'fetch_youtube_playlists',
              message: `No playlists found for: ${source}`,
              source,
            })
          );
          break;
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            stage: 'fetch_youtube_playlists',
            source,
            channelId,
            error: e,
          })
        );
        throw e;
      }

      for (const item of items) {
        if (!item.id) continue;

        // Skip the uploads playlist since it's handled by populateVideos
        if (item.id === uploadPlaylistId) {
          uploadsPlaylistSkipped = true;
          console.log(
            JSON.stringify({
              stage: 'skip_uploads_playlist',
              message: `Skipping uploads playlist ${item.id} as it's handled by populateVideos`,
              source,
              playlistId: item.id,
              playlistName: item.snippet?.title,
            })
          );
          continue;
        }

        youtubePlaylistIds.add(item.id);
        totalPlaylistsProcessed++;

        // Check if playlist already exists
        const { data: existingPlaylist } = await supabaseClient
          .from('playlists')
          .select('id, created_by')
          .eq('youtube_id', item.id)
          .single();

        let upsertedPlaylist;
        if (existingPlaylist) {
          // Update existing playlist but keep the original created_by
          const { data, error: playlistError } = await supabaseClient
            .from('playlists')
            .update({
              name: item.snippet?.title ?? 'Untitled',
              thumbnail_url: removeLiveSuffix(
                getBestThumbnailUrl(item.snippet?.thumbnails)
              ),
              created_at: item.snippet?.publishedAt,
              type: 'Public',
            })
            .eq('youtube_id', item.id)
            .select()
            .single();

          upsertedPlaylist = data;
          if (playlistError) {
            console.error(
              JSON.stringify({
                stage: 'update_playlist',
                source,
                playlistId: item.id,
                error: playlistError,
              })
            );
            continue;
          }

          console.log(
            JSON.stringify({
              stage: 'update_playlist',
              message: `Updated existing playlist ${item.snippet?.title}`,
              source,
              playlistId: item.id,
              internalId: upsertedPlaylist.id,
            })
          );
        } else {
          // Insert new playlist with the correct created_by
          const { data, error: playlistError } = await supabaseClient
            .from('playlists')
            .insert({
              youtube_id: item.id,
              name: item.snippet?.title ?? 'Untitled',
              created_by: userId,
              thumbnail_url: removeLiveSuffix(
                getBestThumbnailUrl(item.snippet?.thumbnails)
              ),
              created_at: item.snippet?.publishedAt,
              type: 'Public',
            })
            .select()
            .single();

          upsertedPlaylist = data;
          if (playlistError) {
            console.error(
              JSON.stringify({
                stage: 'insert_playlist',
                source,
                playlistId: item.id,
                error: playlistError,
              })
            );
            continue;
          }

          console.log(
            JSON.stringify({
              stage: 'insert_playlist',
              message: `Created new playlist ${item.snippet?.title}`,
              source,
              playlistId: item.id,
              internalId: upsertedPlaylist.id,
            })
          );
        }

        // Queue image processing for the playlist thumbnail
        // This will process the YouTube thumbnail and upload it to Supabase storage
        // The processed image path will be stored in image_webp_url column
        const thumbnailUrl = removeLiveSuffix(
          getBestThumbnailUrl(item.snippet?.thumbnails)
        );

        if (thumbnailUrl) {
          await queuePlaylistThumbnailProcessing(
            supabaseClient,
            upsertedPlaylist.id,
            thumbnailUrl,
            50 // Higher priority for playlist thumbnails during sync
          );
        }

        // Now fetch video IDs for this playlist from YouTube
        let videoPageToken: string | null | undefined;
        const allVideoIds: string[] = [];
        do {
          try {
            const { data: playlistItemsData } =
              await youtubeClient.playlistItems.list({
                part: ['contentDetails'],
                playlistId: item.id!,
                maxResults: 50,
                ...(videoPageToken && { pageToken: videoPageToken }),
              });
            const { items: videoItems, nextPageToken: nextVideoPageToken } =
              playlistItemsData ?? {};

            if (videoItems && videoItems.length > 0) {
              allVideoIds.push(
                ...videoItems
                  .map((v) => v.contentDetails?.videoId)
                  .filter((videoId): videoId is string => !!videoId)
              );
            }

            videoPageToken = nextVideoPageToken;
          } catch (e) {
            console.error(
              JSON.stringify({
                stage: 'fetch_playlist_videos',
                source,
                playlistId: item.id,
                error: e,
              })
            );
            throw e;
          }
        } while (videoPageToken);

        if (allVideoIds.length === 0) {
          console.log(
            JSON.stringify({
              stage: 'no_videos_in_playlist',
              message: `No videos found for playlist ${item.snippet?.title}. Will clean up any existing playlist_videos.`,
              source,
              playlistId: item.id,
            })
          );
        }

        // Get existing playlist_videos for this playlist to identify what to delete
        const { data: existingPlaylistVideos, error: existingError } =
          await supabaseClient
            .from('playlist_videos')
            .select('video_id')
            .eq('playlist_id', upsertedPlaylist.id);

        if (existingError) {
          console.error(
            JSON.stringify({
              stage: 'fetch_existing_playlist_videos',
              source,
              playlistId: item.id,
              internalPlaylistId: upsertedPlaylist.id,
              error: existingError,
            })
          );
          throw new Error('Failed to fetch existing playlist videos');
        }

        // Find videos to remove (exist in DB but not in YouTube)
        const existingVideoIds = (existingPlaylistVideos || []).map(
          (pv) => pv.video_id
        );
        const videosToRemove = existingVideoIds.filter(
          (videoId) => !allVideoIds.includes(videoId)
        );

        // Remove playlist_videos that are no longer in YouTube
        if (videosToRemove.length > 0) {
          const { error: deleteError } = await supabaseClient
            .from('playlist_videos')
            .delete()
            .eq('playlist_id', upsertedPlaylist.id)
            .in('video_id', videosToRemove);

          if (deleteError) {
            console.error(
              JSON.stringify({
                stage: 'delete_stale_playlist_videos',
                source,
                playlistId: item.id,
                internalPlaylistId: upsertedPlaylist.id,
                videosToRemove,
                error: deleteError,
              })
            );
          } else {
            console.log(
              JSON.stringify({
                stage: 'delete_stale_playlist_videos',
                message: `Removed ${videosToRemove.length} stale videos from playlist ${item.snippet?.title}`,
                source,
                playlistId: item.id,
                removedVideoIds: videosToRemove,
              })
            );
          }
        }

        // Insert/update current playlist_videos
        let videoPosition = 1;
        for (const videoId of allVideoIds) {
          const { error: insertError } = await supabaseClient
            .from('playlist_videos')
            .upsert(
              {
                playlist_id: upsertedPlaylist.id,
                video_id: videoId,
                video_position: videoPosition,
              },
              {
                onConflict: 'playlist_id,video_id',
              }
            );

          if (insertError) {
            console.error(
              JSON.stringify({
                stage: 'upsert_playlist_video',
                source,
                playlistId: item.id,
                videoId,
                error: insertError,
              })
            );
          }
          videoPosition++;
        }

        console.log(
          JSON.stringify({
            stage: 'playlist_processing_complete',
            message: `Processed playlist ${item.snippet?.title}: ${allVideoIds.length} videos total, ${videosToRemove.length} removed`,
            source,
            playlistId: item.id,
            totalVideos: allVideoIds.length,
            removedVideos: videosToRemove.length,
          })
        );
      }
    } while (pageToken);

    // Step 2: Handle playlists that no longer exist on YouTube (excluding uploads playlist)
    // Get all playlists for this user that are "Public" type, excluding uploads playlist
    const { data: existingPlaylists, error: existingPlaylistsError } =
      await supabaseClient
        .from('playlists')
        .select('id, youtube_id, name')
        .eq('created_by', userId)
        .eq('type', 'Public')
        .neq('youtube_id', uploadPlaylistId); // Exclude uploads playlist from cleanup

    if (existingPlaylistsError) {
      console.error(
        JSON.stringify({
          stage: 'fetch_existing_playlists',
          source,
          error: existingPlaylistsError,
        })
      );
      throw new Error('Failed to fetch existing playlists');
    }

    // Find playlists to remove (exist in DB but not in YouTube, excluding uploads playlist)
    const playlistsToRemove = (existingPlaylists || []).filter(
      (playlist) =>
        playlist.youtube_id && !youtubePlaylistIds.has(playlist.youtube_id)
    );

    if (playlistsToRemove.length > 0) {
      // First, delete all playlist_videos for these playlists
      for (const playlist of playlistsToRemove) {
        const { error: deletePlaylistVideosError } = await supabaseClient
          .from('playlist_videos')
          .delete()
          .eq('playlist_id', playlist.id);

        if (deletePlaylistVideosError) {
          console.error(
            JSON.stringify({
              stage: 'delete_playlist_videos_for_removed_playlist',
              source,
              playlistId: playlist.id,
              youtubeId: playlist.youtube_id,
              error: deletePlaylistVideosError,
            })
          );
        }
      }

      // Then delete the playlists themselves
      const playlistIdsToRemove = playlistsToRemove.map((p) => p.id);
      const { error: deletePlaylistsError } = await supabaseClient
        .from('playlists')
        .delete()
        .in('id', playlistIdsToRemove);

      if (deletePlaylistsError) {
        console.error(
          JSON.stringify({
            stage: 'delete_removed_playlists',
            source,
            playlistIdsToRemove,
            error: deletePlaylistsError,
          })
        );
      } else {
        console.log(
          JSON.stringify({
            stage: 'delete_removed_playlists',
            message: `Removed ${playlistsToRemove.length} playlists that no longer exist on YouTube`,
            source,
            removedPlaylists: playlistsToRemove.map((p) => ({
              id: p.id,
              name: p.name,
              youtube_id: p.youtube_id,
            })),
          })
        );
      }
    }

    console.log(
      JSON.stringify({
        stage: 'sync_complete',
        message: `Playlist sync completed for ${source}. Processed ${totalPlaylistsProcessed} YouTube playlists (skipped uploads playlist), removed ${playlistsToRemove.length} stale playlists`,
        source,
        youtubePlaylistsProcessed: totalPlaylistsProcessed,
        playlistsRemoved: playlistsToRemove.length,
        uploadsPlaylistSkipped,
      })
    );
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
