import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient, } from '@twurple/api';

import { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } from '$env/static/private';

import type { HelixStream } from '@twurple/api';
import { dev } from '$app/environment';

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
const CACHE_DURATION = dev ? 5 * 1000 : 30 * 1000; // 5 seconds in dev, 30 seconds in production
const RATE_LIMIT_DELAY = 100; // 100ms between requests to respect rate limits

// Development testing variables - moved to module level for polling system
let testStartTime: number | null = null;
const TEST_LIVE_START = 10000; // Go live after 10 seconds
const TEST_LIVE_END = 70000; // Go offline after 70 seconds

// Initialize test timer immediately in development mode
if (dev && typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  testStartTime = Date.now();
  console.log(
    '🚀 Twitch test simulation started for nextlander channel - will go live in 10 seconds'
  );
}

// Known user IDs for testing
const NEXTLANDER_USER_ID = '689331234'; // You may need to adjust this ID

/**
 * Check if we're in dev mode test scenario for nextlander
 * Made public so the poller can use it
 */
export function getTestStreamStatus(userId: string): StreamStatus | null {
  if (!dev) return null;

  // Check if this is the nextlander user (you can check by userId or get the ID first)
  const isNextlander = userId === NEXTLANDER_USER_ID || userId === 'nextlander';
  if (!isNextlander) return null;

  const now = Date.now();

  // Initialize test timer on first call if not already initialized
  if (testStartTime === null) {
    testStartTime = now;
    console.log('🎬 Test timer started - nextlander will go live in 10 seconds');
  }

  const elapsed = now - testStartTime;

  // Determine if should be live based on timing
  const shouldBeLive = elapsed >= TEST_LIVE_START && elapsed < TEST_LIVE_END;

  if (dev) {
    const statusEmoji = shouldBeLive ? '🔴' : '⚫';
    const timeUntilChange = shouldBeLive
      ? Math.max(0, TEST_LIVE_END - elapsed)
      : Math.max(0, TEST_LIVE_START - elapsed);

    console.log(`${statusEmoji} Test Status: nextlander ${shouldBeLive ? 'LIVE' : 'OFFLINE'} (${elapsed}ms elapsed, next change in ${timeUntilChange}ms)`);
  }

  const status: StreamStatus = {
    userId,
    isLive: shouldBeLive,
    lastChecked: now,
    // Don't create a full stream object, just indicate live status
    stream: shouldBeLive ? ({} as HelixStream) : undefined,
  };

  // Don't cache test scenarios - return fresh status each time to allow dynamic changes
  // This ensures the test stream can transition from offline to online to offline

  return status;
}

/**
 * Get stream status for a single user
 */
export async function getStreamStatus(
  userId: string
): Promise<StreamStatus | null> {
  // Check for dev mode test override first
  const testStatus = getTestStreamStatus(userId);
  if (testStatus) {
    return testStatus;
  }

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
  if (!apiClient && !dev) {
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
 * Reset test timing (useful for testing)
 */
export function resetTestTimer(): void {
  testStartTime = null;
  clearStreamCache(); // Also clear cache when resetting
  console.log('🔄 Test timer reset - next call will restart the sequence');

  // Re-initialize if in development mode
  if (dev && typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
    testStartTime = Date.now();
    console.log(
      '🚀 Twitch test simulation restarted for nextlander channel - will go live in 10 seconds'
    );
  }
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

/**
 * Get current test timer info (useful for debugging)
 */
export function getTestTimerInfo() {
  if (!dev || testStartTime === null) {
    return null;
  }

  const now = Date.now();
  const elapsed = now - testStartTime;

  return {
    started: new Date(testStartTime).toISOString(),
    elapsed,
    liveStart: TEST_LIVE_START,
    liveEnd: TEST_LIVE_END,
    currentlyInLiveWindow: elapsed >= TEST_LIVE_START && elapsed < TEST_LIVE_END,
    timeUntilLive: elapsed < TEST_LIVE_START ? TEST_LIVE_START - elapsed : 0,
    timeUntilOffline: elapsed < TEST_LIVE_END ? TEST_LIVE_END - elapsed : 0,
  };
}
