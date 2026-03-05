import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Types matching the main application
type Source = 'giantbomb' | 'jeffgerstmann' | 'nextlander' | 'remap';

interface SourceInfo {
  displayName: string;
  twitchId: string;
  twitchUserName?: string;
}

interface StreamStatus {
  userId: string;
  isLive: boolean;
  lastChecked: number;
}

interface TwitchStreamResponse {
  data: Array<{
    id: string;
    user_id: string;
    user_login: string;
    user_name: string;
    game_id: string;
    type: string;
    title: string;
    viewer_count: number;
    started_at: string;
    language: string;
    thumbnail_url: string;
  }>;
  pagination?: {
    cursor?: string;
  };
}

interface PollResponse {
  success: boolean;
  processedCount: number;
  activeStreams: Source[];
  error?: string;
  timestamp: string;
  duration?: number;
}

// Source information (mirrored from main app)
const SOURCE_INFO: Record<Source, SourceInfo> = {
  giantbomb: {
    displayName: 'Giant Bomb',
    twitchId: '504350',
  },
  jeffgerstmann: {
    displayName: 'Jeff Gerstmann',
    twitchId: '13831039',
  },
  nextlander: {
    displayName: 'Nextlander',
    twitchId: '689331234',
  },
  remap: {
    displayName: 'Remap',
    twitchUserName: 'RemapRadio',
    twitchId: '913491352',
  },
};

const SOURCES: Source[] = ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'];

/**
 * Get Twitch App Access Token
 */
async function getTwitchAppToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get Twitch token: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Get multiple stream statuses from Twitch API
 */
async function getMultipleStreamStatus(
  userIds: string[],
  clientId: string,
  accessToken: string
): Promise<StreamStatus[]> {
  if (userIds.length === 0) {
    return [];
  }

  // Build query parameters for multiple user IDs
  const params = new URLSearchParams();
  userIds.forEach((id) => params.append('user_id', id));

  const response = await fetch(
    `https://api.twitch.tv/helix/streams?${params.toString()}`,
    {
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Twitch API error: ${response.status} ${response.statusText}`
    );
  }

  const data: TwitchStreamResponse = await response.json();
  const now = Date.now();

  // Create stream status for all requested user IDs
  return userIds.map((userId) => {
    const liveStream = data.data.find((stream) => stream.user_id === userId);
    return {
      userId,
      isLive: !!liveStream,
      lastChecked: now,
    };
  });
}

/**
 * Update active streams in database
 */
async function updateActiveStreams(
  supabase: ReturnType<typeof createClient>,
  streamStatuses: StreamStatus[]
): Promise<void> {
  console.log('📊 Updating active streams in database...');

  for (const status of streamStatuses) {
    // Find the source that matches this user ID
    const source = SOURCES.find(
      (s) => SOURCE_INFO[s].twitchId === status.userId
    );

    if (!source) {
      console.warn(`⚠️ Unknown source for userId ${status.userId}`);
      continue;
    }

    const { error } = await supabase.from('active_streams').upsert(
      {
        source,
        is_live: status.isLive,
        last_checked: new Date().toISOString(),
      },
      {
        onConflict: 'source',
      }
    );

    if (error) {
      console.error(`❌ Error updating ${source}:`, error);
      throw error;
    }

    console.log(`✅ Updated ${source}: ${status.isLive ? 'LIVE' : 'offline'}`);
  }
}

/**
 * Main polling function
 */
async function pollTwitchStreams(): Promise<PollResponse> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log('🔄 Starting Twitch stream polling...');

  // Validate environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const twitchClientId = Deno.env.get('TWITCH_CLIENT_ID');
  const twitchClientSecret = Deno.env.get('TWITCH_CLIENT_SECRET');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  if (!twitchClientId || !twitchClientSecret) {
    throw new Error('Missing required Twitch environment variables');
  }

  // Skip if using placeholder credentials
  if (
    twitchClientId === 'placeholder_client_id' ||
    twitchClientSecret === 'placeholder_client_secret'
  ) {
    console.log('🚫 Skipping poll - placeholder Twitch credentials detected');
    return {
      success: true,
      processedCount: 0,
      activeStreams: [],
      timestamp,
      duration: Date.now() - startTime,
    };
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get Twitch access token
    console.log('🔑 Getting Twitch access token...');
    const accessToken = await getTwitchAppToken(
      twitchClientId,
      twitchClientSecret
    );

    // Get all Twitch user IDs
    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);
    console.log('📋 Polling for user IDs:', twitchIds);

    // Fetch stream statuses
    console.log('🌐 Fetching stream statuses from Twitch API...');
    const streamStatuses = await getMultipleStreamStatus(
      twitchIds,
      twitchClientId,
      accessToken
    );

    // Update database
    await updateActiveStreams(supabase, streamStatuses);

    // Get list of currently active streams
    const activeStreams = SOURCES.filter((source) => {
      const status = streamStatuses.find(
        (s) => s.userId === SOURCE_INFO[source].twitchId
      );
      return status?.isLive || false;
    });

    const duration = Date.now() - startTime;
    console.log(
      `✅ Poll completed in ${duration}ms. Active streams: [${activeStreams.join(', ')}]`
    );

    return {
      success: true,
      processedCount: streamStatuses.length,
      activeStreams,
      timestamp,
      duration,
    };
  } catch (error) {
    console.error('❌ Error during Twitch polling:', error);
    throw error;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Method not allowed',
        processedCount: 0,
        activeStreams: [],
        timestamp: new Date().toISOString(),
      }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    console.log('🚀 Twitch polling edge function called');
    const result = await pollTwitchStreams();

    console.log('📋 Edge function result:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('❌ Edge function error:', error);

    const errorResponse: PollResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      processedCount: 0,
      activeStreams: [],
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
