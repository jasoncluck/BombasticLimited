import { youtube, youtube_v3 } from '@googleapis/youtube';
import { Client } from 'pg';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'crypto';
import { CHANNEL_INFO, ChannelSource } from '../channel';

const MAX_RESULTS = 5; // Reduced from 50 since playlists are not added frequently

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION,
});

/**
 * Gets (or creates) the Cognito user representing a channel source, and
 * ensures it has a matching `profiles` row. Playlists auto-synced from
 * YouTube need a `created_by` (FK to profiles.id) — these are synthetic
 * "channel" accounts, never actually signed into.
 *
 * Replaces the old Supabase `create_user()` RPC, which wrote directly to
 * GoTrue's internal tables (dropped — doesn't exist on Neon/Cognito).
 */
async function getOrCreateChannelProfile({
  client,
  source,
}: {
  client: Client;
  source: ChannelSource;
}): Promise<string> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;
  const email = `${source}@bombastic.ltd`;

  let userSub: string | undefined;
  try {
    const existing = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email })
    );
    userSub = existing.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
  } catch (err) {
    if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
  }

  if (!userSub) {
    const created = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      })
    );
    userSub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
    if (!userSub) {
      throw new Error(
        `Failed to get sub for newly created channel user: ${email}`
      );
    }

    // Set a permanent password so the account isn't stuck in
    // FORCE_CHANGE_PASSWORD — never actually used to sign in.
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: `Ch${randomBytes(18).toString('base64url')}1`,
        Permanent: true,
      })
    );
  }

  // Mirrors $lib/server/profile.ts's ensureProfileExists — kept in sync
  // manually since this Lambda can't import from the SvelteKit app package.
  const { rows } = await client.query('SELECT id FROM profiles WHERE id = $1', [
    userSub,
  ]);
  if (rows.length === 0) {
    const { rows: usernameRows } = await client.query<{
      generate_unique_username: string;
    }>('SELECT generate_unique_username($1) AS generate_unique_username', [
      source,
    ]);
    const username = usernameRows[0]?.generate_unique_username ?? source;
    const usernameHistory = JSON.stringify([
      { username, used_from: new Date().toISOString(), used_until: null },
    ]);

    await client.query(
      `INSERT INTO profiles (id, username, providers, account_type, username_history)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [userSub, username, ['email'], 'default', usernameHistory]
    );
  }

  return userSub;
}

async function queuePlaylistThumbnailProcessing({
  client,
  playlistId,
  thumbnailUrl,
  priority = 100,
}: {
  client: Client;
  playlistId: number;
  thumbnailUrl: string | null;
  priority?: number;
}): Promise<void> {
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
    const { rows } = await client.query<{ queue_image_processing_job: string }>(
      `SELECT queue_image_processing_job($1, $2, $3, $4, NULL, $5) AS queue_image_processing_job`,
      [
        'playlist',
        playlistId.toString(),
        'playlist_image',
        thumbnailUrl,
        priority,
      ]
    );
    const jobId = rows[0]?.queue_image_processing_job;

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

  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
  });
  await client.connect();

  try {
    let userId: string;
    try {
      userId = await getOrCreateChannelProfile({ client, source });
    } catch (createUserError) {
      console.error(
        JSON.stringify({
          stage: 'create_or_get_user',
          source,
          error: createUserError,
          message: `Failed to create or get user for source: ${source}`,
        })
      );
      throw new Error(
        `Failed to create or get user for source: ${source}: ${
          createUserError instanceof Error
            ? createUserError.message
            : createUserError
        }`,
        { cause: createUserError }
      );
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
        const { rows: existingRows } = await client.query<{
          id: number;
          created_by: string | null;
        }>(
          'SELECT id, created_by FROM public.playlists WHERE youtube_id = $1',
          [item.id]
        );
        const existingPlaylist = existingRows[0];

        const thumbnailUrl = removeLiveSuffix(
          getBestThumbnailUrl(item.snippet?.thumbnails)
        );

        let upsertedPlaylistId: number;
        if (existingPlaylist) {
          // Update existing playlist but keep the original created_by
          try {
            const { rows } = await client.query<{ id: number }>(
              `UPDATE public.playlists
               SET name = $1, thumbnail_url = $2, created_at = $3, type = 'Public'
               WHERE youtube_id = $4
               RETURNING id`,
              [
                item.snippet?.title ?? 'Untitled',
                thumbnailUrl,
                item.snippet?.publishedAt,
                item.id,
              ]
            );
            upsertedPlaylistId = rows[0].id;
          } catch (playlistError) {
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
              internalId: upsertedPlaylistId,
            })
          );
        } else {
          // Insert new playlist with the correct created_by
          try {
            const { rows } = await client.query<{ id: number }>(
              `INSERT INTO public.playlists (youtube_id, name, created_by, thumbnail_url, created_at, type)
               VALUES ($1, $2, $3, $4, $5, 'Public')
               RETURNING id`,
              [
                item.id,
                item.snippet?.title ?? 'Untitled',
                userId,
                thumbnailUrl,
                item.snippet?.publishedAt,
              ]
            );
            upsertedPlaylistId = rows[0].id;
          } catch (playlistError) {
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
              internalId: upsertedPlaylistId,
            })
          );
        }

        // Queue image processing for the playlist thumbnail
        if (thumbnailUrl) {
          await queuePlaylistThumbnailProcessing({
            client,
            playlistId: upsertedPlaylistId,
            thumbnailUrl,
            priority: 50, // Higher priority for playlist thumbnails during sync
          });
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
        let existingVideoIds: string[];
        try {
          const { rows } = await client.query<{ video_id: string }>(
            'SELECT video_id FROM public.playlist_videos WHERE playlist_id = $1',
            [upsertedPlaylistId]
          );
          existingVideoIds = rows.map((r) => r.video_id);
        } catch (existingError) {
          console.error(
            JSON.stringify({
              stage: 'fetch_existing_playlist_videos',
              source,
              playlistId: item.id,
              internalPlaylistId: upsertedPlaylistId,
              error: existingError,
            })
          );
          throw new Error('Failed to fetch existing playlist videos', {
            cause: existingError,
          });
        }

        // Find videos to remove (exist in DB but not in YouTube)
        const videosToRemove = existingVideoIds.filter(
          (videoId) => !allVideoIds.includes(videoId)
        );

        // Remove playlist_videos that are no longer in YouTube
        if (videosToRemove.length > 0) {
          try {
            await client.query(
              `DELETE FROM public.playlist_videos
               WHERE playlist_id = $1 AND video_id = ANY($2::text[])`,
              [upsertedPlaylistId, videosToRemove]
            );

            console.log(
              JSON.stringify({
                stage: 'delete_stale_playlist_videos',
                message: `Removed ${videosToRemove.length} stale videos from playlist ${item.snippet?.title}`,
                source,
                playlistId: item.id,
                removedVideoIds: videosToRemove,
              })
            );
          } catch (deleteError) {
            console.error(
              JSON.stringify({
                stage: 'delete_stale_playlist_videos',
                source,
                playlistId: item.id,
                internalPlaylistId: upsertedPlaylistId,
                videosToRemove,
                error: deleteError,
              })
            );
          }
        }

        // Insert/update current playlist_videos
        let videoPosition = 1;
        for (const videoId of allVideoIds) {
          try {
            await client.query(
              `INSERT INTO public.playlist_videos (playlist_id, video_id, video_position)
               VALUES ($1, $2, $3)
               ON CONFLICT (playlist_id, video_id) DO UPDATE SET video_position = EXCLUDED.video_position`,
              [upsertedPlaylistId, videoId, videoPosition]
            );
          } catch (insertError) {
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
    let existingPlaylists: { id: number; youtube_id: string; name: string }[];
    try {
      const { rows } = await client.query<{
        id: number;
        youtube_id: string;
        name: string;
      }>(
        `SELECT id, youtube_id, name FROM public.playlists
         WHERE created_by = $1 AND type = 'Public' AND youtube_id != $2`,
        [userId, uploadPlaylistId]
      );
      existingPlaylists = rows;
    } catch (existingPlaylistsError) {
      console.error(
        JSON.stringify({
          stage: 'fetch_existing_playlists',
          source,
          error: existingPlaylistsError,
        })
      );
      throw new Error('Failed to fetch existing playlists', {
        cause: existingPlaylistsError,
      });
    }

    // Find playlists to remove (exist in DB but not in YouTube, excluding uploads playlist)
    const playlistsToRemove = existingPlaylists.filter(
      (playlist) =>
        playlist.youtube_id && !youtubePlaylistIds.has(playlist.youtube_id)
    );

    if (playlistsToRemove.length > 0) {
      // First, delete all playlist_videos for these playlists
      for (const playlist of playlistsToRemove) {
        try {
          await client.query(
            'DELETE FROM public.playlist_videos WHERE playlist_id = $1',
            [playlist.id]
          );
        } catch (deletePlaylistVideosError) {
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
      try {
        await client.query(
          'DELETE FROM public.playlists WHERE id = ANY($1::bigint[])',
          [playlistIdsToRemove]
        );

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
      } catch (deletePlaylistsError) {
        console.error(
          JSON.stringify({
            stage: 'delete_removed_playlists',
            source,
            playlistIdsToRemove,
            error: deletePlaylistsError,
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
  } finally {
    await client.end();
  }
};
