import { createClient } from '@supabase/supabase-js';
import { youtube, youtube_v3 } from '@googleapis/youtube';
import { CHANNEL_INFO, ChannelSource } from '../channel';

const MAX_RESULTS = 5; // Reduced from 50 since playlists are not added frequently

// Helper function to get the best quality thumbnail URL with fallbacks
function getBestThumbnailUrl(thumbnails?: youtube_v3.Schema$ThumbnailDetails): {
  thumbnailUrl: string | null;
  thumbnailMaxResUrl: string | null;
} {
  if (!thumbnails) {
    return { thumbnailUrl: null, thumbnailMaxResUrl: null };
  }

  // Priority order: maxres > high > medium > default
  const maxresUrl = thumbnails.maxres?.url || null;

  // For thumbnailUrl, prefer medium (320x180) over default (120x90)
  // If maxres exists, we'll use medium for thumbnailUrl
  // If no maxres, use the highest available for thumbnailUrl
  let thumbnailUrl: string | null = null;

  if (maxresUrl) {
    // If we have maxres, use medium for standard thumbnailUrl
    thumbnailUrl =
      thumbnails.medium?.url ||
      thumbnails.high?.url ||
      thumbnails.default?.url ||
      null;
  } else {
    // If no maxres, use the highest quality available for thumbnailUrl
    thumbnailUrl =
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      null;
  }

  return {
    thumbnailUrl,
    thumbnailMaxResUrl: maxresUrl,
  };
}

// Helper to remove "_live" suffix from thumbnail URLs (same as in video processing)
const removeLiveSuffix = (url?: string | null) =>
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
    const defaultPassword = 'temp_password_123'; // You may want to generate a random password

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

    // Fetch playlists from YouTube
    const { data } = await youtubeClient.playlists.list({
      part: ['id', 'snippet', 'contentDetails'],
      channelId: channelId,
      maxResults: MAX_RESULTS,
    });

    const youtubePlaylistItems = data.items || [];

    console.log(
      JSON.stringify({
        stage: 'fetch_youtube_playlists',
        message: `Fetched ${youtubePlaylistItems.length} playlists from YouTube`,
        source,
      })
    );

    // Process playlists
    const playlists = youtubePlaylistItems
      .filter((item) => item.id !== uploadPlaylistId) // Exclude the upload playlist
      .map((item) => {
        const { thumbnailUrl, thumbnailMaxResUrl } = getBestThumbnailUrl(
          item.snippet?.thumbnails
        );

        return {
          id: item.id,
          title: item.snippet?.title,
          description: item.snippet?.description,
          published_at: item.snippet?.publishedAt,
          thumbnail_url: removeLiveSuffix(thumbnailUrl),
          thumbnail_maxres_url: removeLiveSuffix(thumbnailMaxResUrl),
          source: source,
          user_id: userId,
        };
      });

    if (playlists.length > 0) {
      // Upsert playlists
      const { error: upsertError } = await supabaseClient
        .from('playlists')
        .upsert(playlists, { onConflict: 'id' });

      if (upsertError) {
        console.error(
          JSON.stringify({
            stage: 'upsert_playlists',
            source,
            error: upsertError,
          })
        );
        throw upsertError;
      }

      console.log(
        JSON.stringify({
          stage: 'upsert_playlists_success',
          message: `Upserted ${playlists.length} playlists for source: ${source}`,
          playlistIds: playlists.map((p) => p.id),
        })
      );
    } else {
      console.log(
        JSON.stringify({
          stage: 'no_playlists_found',
          message: `No public playlists found for source: ${source}`,
        })
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        stage: 'final_error',
        source,
        error: e instanceof Error ? e.message : e,
        stack: e instanceof Error ? e.stack : undefined,
      })
    );
    throw e;
  }
};
