import { Client } from 'pg';

// Ported from supabase/functions/poll-twitch-streams (Supabase Edge Function).
type Source = 'giantbomb' | 'jeffgerstmann' | 'nextlander' | 'remap';

interface SourceInfo {
  displayName: string;
  twitchId: string;
}

interface StreamStatus {
  userId: string;
  isLive: boolean;
}

interface TwitchStreamResponse {
  data: Array<{ user_id: string }>;
}

const SOURCE_INFO: Record<Source, SourceInfo> = {
  giantbomb: { displayName: 'Giant Bomb', twitchId: '504350' },
  jeffgerstmann: { displayName: 'Jeff Gerstmann', twitchId: '13831039' },
  nextlander: { displayName: 'Nextlander', twitchId: '689331234' },
  remap: { displayName: 'Remap', twitchId: '913491352' },
};

const SOURCES: Source[] = ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'];

async function getTwitchAppToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

async function getMultipleStreamStatus(
  userIds: string[],
  clientId: string,
  accessToken: string
): Promise<StreamStatus[]> {
  const params = new URLSearchParams();
  userIds.forEach((id) => params.append('user_id', id));

  const response = await fetch(
    `https://api.twitch.tv/helix/streams?${params.toString()}`,
    {
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Twitch API error: ${response.status} ${response.statusText}`
    );
  }

  const data: TwitchStreamResponse = await response.json();

  return userIds.map((userId) => ({
    userId,
    isLive: data.data.some((stream) => stream.user_id === userId),
  }));
}

export interface PollResponse {
  success: boolean;
  processedCount: number;
  activeStreams: Source[];
  error?: string;
  timestamp: string;
  duration?: number;
}

export const handler = async (): Promise<PollResponse> => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!twitchClientId || !twitchClientSecret) {
    throw new Error('Missing required Twitch environment variables');
  }

  const pgClient = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await pgClient.connect();

  try {
    const accessToken = await getTwitchAppToken(
      twitchClientId,
      twitchClientSecret
    );

    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);
    const streamStatuses = await getMultipleStreamStatus(
      twitchIds,
      twitchClientId,
      accessToken
    );

    for (const status of streamStatuses) {
      const source = SOURCES.find(
        (s) => SOURCE_INFO[s].twitchId === status.userId
      );
      if (!source) continue;

      await pgClient.query(
        `INSERT INTO active_streams (source, is_live, last_checked)
         VALUES ($1, $2, NOW())
         ON CONFLICT (source) DO UPDATE
         SET is_live = EXCLUDED.is_live, last_checked = EXCLUDED.last_checked`,
        [source, status.isLive]
      );
    }

    const activeStreams = SOURCES.filter((source) => {
      const status = streamStatuses.find(
        (s) => s.userId === SOURCE_INFO[source].twitchId
      );
      return status?.isLive ?? false;
    });

    return {
      success: true,
      processedCount: streamStatuses.length,
      activeStreams,
      timestamp,
      duration: Date.now() - startTime,
    };
  } finally {
    await pgClient.end();
  }
};
