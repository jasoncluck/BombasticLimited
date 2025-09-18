import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

import { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } from '$env/static/private';

import type { HelixStream } from '@twurple/api';
import { browser } from '$app/environment';

const clientId = TWITCH_CLIENT_ID;
const clientSecret = TWITCH_CLIENT_SECRET;

// Only initialize Twitch client if we have real credentials and not during build
const shouldInitialize =
  clientId !== 'placeholder_client_id' &&
  clientSecret !== 'placeholder_client_secret' &&
  !browser && // Server-side only
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
const API_REQUEST_TIMEOUT = 10000; // 10 second timeout for individual API requests

/**
 * Check if we're in test scenario for nextlander (now works in all environments)
 */
function getTestStreamStatus(userId: string): StreamStatus | null {
  // Enable test in all environments for now (as requested)
  // if (!dev) return null;

  // Check if this is the nextlander user (you can check by userId or get the ID first)
  const isNextlander = userId === NEXTLANDER_USER_ID || userId === 'nextlander';
  if (!isNextlander) return null;

  const now = Date.now();

  // Initialize test timer on first call
  if (testStartTime === null) {
    testStartTime = now;
    console.log(
      '🧪 Test timer started - nextlander will go "live" in 10 seconds, then offline after 1 minute 10 seconds'
    );
  }

  const elapsed = now - testStartTime;

  // Determine if should be live based on timing
  const shouldBeLive = elapsed >= TEST_LIVE_START && elapsed < TEST_LIVE_END;

  if (
    shouldBeLive &&
    elapsed >= TEST_LIVE_START &&
    elapsed < TEST_LIVE_START + 1000
  ) {
    console.log('🔴 nextlander is now "live" (test simulation)');
  } else if (
    !shouldBeLive &&
    elapsed >= TEST_LIVE_END &&
    elapsed < TEST_LIVE_END + 1000
  ) {
    console.log('⚫ nextlander is now "offline" (test simulation)');
  }

  const status: StreamStatus = {
    userId,
    isLive: shouldBeLive,
    lastChecked: now,
    // Don't create a full stream object, just indicate live status
    stream: shouldBeLive ? ({} as HelixStream) : undefined,
  };

  // Cache the result but with shorter duration in dev mode
  streamCache.set(userId, status);

  return status;
}

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
    // Add timeout protection to the API call
    const stream = await withApiTimeout(
      apiClient.streams.getStreamByUserId(userId)
    );

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
 * Get stream status for multiple users
 */
export async function getMultipleStreamStatus(
  userIds: string[]
): Promise<StreamStatus[]> {
  if (!apiClient) {
    console.warn('Twitch API client not initialized - missing credentials');
    return [];
  }

  const results: StreamStatus[] = [];

  // Process requests with timeout protection
  for (let i = 0; i < userIds.length; i++) {
    try {
      const status = await getStreamStatus(userIds[i]);
      if (status) {
        results.push(status);
      }
    } catch (error) {
      console.error(`Failed to get status for user ${userIds[i]}:`, error);
      // Continue with other users even if one fails
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
 * Get cache statistics (useful for debugging)
 */
export function getCacheStats() {
  return {
    size: streamCache.size,
    entries: Array.from(streamCache.entries()).map(([key, value]) => ({
      userId: key,
      isLive: value.isLive,
      lastChecked: new Date(value.lastChecked).toISOString(),
    })),
  };
}
 
 
 
 
 
 
 
 
 
 
 
 
 
 
