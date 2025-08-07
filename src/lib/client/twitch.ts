import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } from '$env/static/private';
import type { HelixStream } from '@twurple/api';

const clientId = TWITCH_CLIENT_ID;
const clientSecret = TWITCH_CLIENT_SECRET;

// Only initialize Twitch client if we have real credentials and not during build
const shouldInitialize =
  clientId !== 'placeholder_client_id' &&
  clientSecret !== 'placeholder_client_secret' &&
  typeof window === 'undefined' && // Server-side only
  process.env.NODE_ENV !== 'test';

let authProvider: AppTokenAuthProvider | undefined;
let apiClient: ApiClient | undefined;

// Initialize Twitch API client
if (shouldInitialize) {
  authProvider = new AppTokenAuthProvider(clientId, clientSecret);
  apiClient = new ApiClient({ authProvider });
}

// Cache for stream status to minimize API calls
interface StreamStatus {
  userId: string;
  isLive: boolean;
  lastChecked: number;
  stream?: HelixStream;
}

const streamCache = new Map<string, StreamStatus>();
const CACHE_DURATION = 30 * 1000; // 30 seconds cache
const RATE_LIMIT_DELAY = 100; // 100ms between requests to respect rate limits

/**
 * Get stream status for a single user
 */
export async function getStreamStatus(
  userId: string
): Promise<StreamStatus | null> {
  if (!apiClient) {
    console.warn('Twitch API client not initialized - missing credentials');
    return null;
  }

  const now = Date.now();
  const cached = streamCache.get(userId);

  // Return cached result if still valid
  if (cached && now - cached.lastChecked < CACHE_DURATION) {
    return cached;
  }

  try {
    const stream = await apiClient.streams.getStreamByUserId(userId);
    const status: StreamStatus = {
      userId,
      isLive: stream !== null,
      lastChecked: now,
      stream: stream || undefined,
    };

    streamCache.set(userId, status);
    return status;
  } catch (error) {
    console.error(`Failed to fetch stream status for user ${userId}:`, error);

    // Return cached data if available, even if stale
    if (cached) {
      return cached;
    }

    // Return offline status as fallback
    const fallbackStatus: StreamStatus = {
      userId,
      isLive: false,
      lastChecked: now,
    };
    streamCache.set(userId, fallbackStatus);
    return fallbackStatus;
  }
}

/**
 * Get stream status for multiple users with rate limiting
 */
export async function getMultipleStreamStatus(
  userIds: string[]
): Promise<StreamStatus[]> {
  if (!apiClient) {
    console.warn('Twitch API client not initialized - missing credentials');
    return [];
  }

  const results: StreamStatus[] = [];

  for (let i = 0; i < userIds.length; i++) {
    const status = await getStreamStatus(userIds[i]);
    if (status) {
      results.push(status);
    }

    // Add delay between requests to respect rate limits (except for last request)
    if (i < userIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  }

  return results;
}

/**
 * Clear the stream cache (useful for testing)
 */
export function clearStreamCache(): void {
  streamCache.clear();
}

/**
 * Get current cache stats (useful for debugging)
 */
export function getCacheStats() {
  return {
    size: streamCache.size,
    entries: Array.from(streamCache.entries()).map(([userId, status]) => ({
      userId,
      isLive: status.isLive,
      lastChecked: new Date(status.lastChecked).toISOString(),
      cacheAge: Date.now() - status.lastChecked,
    })),
  };
}
