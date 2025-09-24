/**
 * Background Twitch stream poller optimized for serverless environments like Vercel
 * Uses stateless polling with shared state management
 */

import { getMultipleStreamStatus, type StreamStatus } from '$lib/client/twitch';
import { SOURCE_INFO, SOURCES, type Source } from '$lib/constants/source';
import { dev } from '$app/environment';

// Global state for active streams - this persists across requests within the same instance
const activeStreams = new Set<Source>();
let lastPollTime = 0;
let isPolling = false;
let pollingTimeout: NodeJS.Timeout | null = null;
let pollingExplicitlyStarted = false;

// Configuration optimized for serverless
const POLL_INTERVAL = dev ? 10000 : 60000; // 10 seconds in dev, 1 minute in prod
const MIN_POLL_INTERVAL = 2000; // Minimum 2 seconds between polls

// Event listeners for stream changes
type StreamChangeListener = (activeStreams: Source[]) => void;
const changeListeners = new Set<StreamChangeListener>();

/**
 * Add a listener for stream changes
 */
export function addStreamChangeListener(
  listener: StreamChangeListener
): () => void {
  changeListeners.add(listener);

  // Trigger immediate poll when first listener is added
  if (changeListeners.size === 1) {
    triggerPollIfNeeded();
  }

  // Return cleanup function
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Get current active streams, forcing fresh data fetch if needed
 * This is the main function for serverless on-demand polling
 */
export async function getActiveStreamsWithFreshData(): Promise<Source[]> {
  const now = Date.now();
  const timeSinceLastPoll = now - lastPollTime;
  
  // Force fresh poll if data is stale or this is the first call
  const shouldPoll = lastPollTime === 0 || timeSinceLastPoll > POLL_INTERVAL;
  
  if (shouldPoll && !isPolling) {
    if (dev) {
      console.log(`🔄 Forcing fresh poll (${timeSinceLastPoll}ms since last poll)`);
    }
    await pollStreamStatus();
  } else if (isPolling) {
    // If already polling, wait for it to complete
    if (dev) {
      console.log('⏳ Waiting for ongoing poll to complete...');
    }
    
    // Wait for the current poll to complete (with timeout)
    const pollTimeout = 10000; // 10 second timeout
    const startWait = Date.now();
    
    while (isPolling && (Date.now() - startWait) < pollTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (isPolling) {
      console.warn('⚠️ Poll timeout - returning current data');
    }
  }
  
  return Array.from(activeStreams);
}

/**
 * Get current active streams
 */
export function getActiveStreams(): Source[] {
  // For backward compatibility, still trigger a poll if data is stale in development
  if (dev) {
    triggerPollIfNeeded();
  }
  return Array.from(activeStreams);
}

/**
 * Notify all listeners of stream changes
 */
function notifyListeners() {
  const currentStreams = Array.from(activeStreams);
  changeListeners.forEach((listener) => {
    try {
      listener(currentStreams);
    } catch (error) {
      console.error('Error in stream change listener:', error);
    }
  });
}

/**
 * Check if we need to poll and trigger if necessary
 */
function triggerPollIfNeeded() {
  const now = Date.now();
  const timeSinceLastPoll = now - lastPollTime;

  // In development mode, poll more aggressively to support test stream simulation
  const effectivePollInterval = dev ? 5000 : POLL_INTERVAL; // 5 seconds in dev, 60 seconds in prod

  if (dev) {
    console.log(`⏰ Poll check: timeSince=${timeSinceLastPoll}ms, threshold=${effectivePollInterval}ms, listeners=${changeListeners.size}`);
  }

  // If we have listeners and data is stale, poll immediately
  if (changeListeners.size > 0 && timeSinceLastPoll > effectivePollInterval) {
    console.log('🚀 Triggering immediate poll due to stale data');
    pollStreamStatus();
  }

  // For direct API calls (no listeners), still poll if data is stale in dev mode
  if (
    changeListeners.size === 0 &&
    dev &&
    timeSinceLastPoll > effectivePollInterval
  ) {
    console.log('🚀 Triggering dev poll for direct API call');
    pollStreamStatus();
  }

  // Set up next poll if we have listeners and aren't already polling
  if (changeListeners.size > 0 && !isPolling) {
    scheduleNextPoll();
  }
}

/**
 * Schedule the next poll using setTimeout instead of setInterval
 * This is more serverless-friendly
 */
function scheduleNextPoll() {
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
  }

  pollingTimeout = setTimeout(() => {
    pollingTimeout = null;
    // Continue polling if explicitly started or if there are listeners
    if (changeListeners.size > 0 || pollingExplicitlyStarted) {
      console.log('⏰ Scheduled poll executing...');
      pollStreamStatus();
      scheduleNextPoll(); // Schedule next poll
    }
  }, POLL_INTERVAL);

  if (dev) {
    console.log(`⏰ Next poll scheduled in ${POLL_INTERVAL}ms`);
  }
}

/**
 * Poll Twitch API for stream status updates
 * Enhanced with better error handling and logging for serverless environments
 */
async function pollStreamStatus(): Promise<void> {
  const now = Date.now();
  const pollId = Math.random().toString(36).substr(2, 9);

  // Prevent excessive polling
  if (now - lastPollTime < MIN_POLL_INTERVAL) {
    console.log(`⚠️ [${pollId}] Skipping poll due to rate limiting (${now - lastPollTime}ms < ${MIN_POLL_INTERVAL}ms)`);
    return;
  }

  // Set polling flag
  isPolling = true;
  lastPollTime = now;

  console.log(`🔄 [${pollId}] Starting stream status poll...`);
  const startTime = Date.now();

  try {
    // Get all Twitch user IDs from sources
    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);
    console.log(`📋 [${pollId}] Polling for user IDs:`, twitchIds);

    // Fetch stream status for all sources with timeout
    const fetchPromise = getMultipleStreamStatus(twitchIds);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Poll timeout')), 15000); // 15 second timeout
    });

    const streamStatuses = await Promise.race([fetchPromise, timeoutPromise]);
    const fetchDuration = Date.now() - startTime;
    
    console.log(`📊 [${pollId}] Poll results (${fetchDuration}ms):`, streamStatuses);

    // Handle case where API returns undefined/null
    if (!streamStatuses || !Array.isArray(streamStatuses)) {
      console.warn(`⚠️ [${pollId}] No stream statuses returned from API - keeping current state`);
      return;
    }

    // Validate stream statuses structure
    const validStatuses = streamStatuses.filter(status => 
      status && typeof status === 'object' && 
      'userId' in status && 'isLive' in status
    );

    if (validStatuses.length !== streamStatuses.length) {
      console.warn(`⚠️ [${pollId}] Filtered ${streamStatuses.length - validStatuses.length} invalid status objects`);
    }

    // Track previous state for change detection
    const previouslyActive = new Set(activeStreams);
    activeStreams.clear();

    // Update active streams
    let processedCount = 0;
    let addedCount = 0;
    
    for (const status of validStatuses) {
      const sourceName = SOURCES.find(
        (source) => SOURCE_INFO[source].twitchId === status.userId
      );

      console.log(
        `🔍 [${pollId}] Processing stream status: userId=${status.userId}, isLive=${status.isLive}, sourceName=${sourceName}`
      );

      processedCount++;

      if (sourceName && status.isLive) {
        activeStreams.add(sourceName);
        addedCount++;
        console.log(`✅ [${pollId}] Added ${sourceName} to active streams`);
      } else if (!sourceName && status.isLive) {
        console.warn(`⚠️ [${pollId}] Unknown source for userId ${status.userId} (live but not in SOURCE_INFO)`);
      }
    }

    // Only notify if there were changes
    const hasChanges =
      activeStreams.size !== previouslyActive.size ||
      [...activeStreams].some((s) => !previouslyActive.has(s)) ||
      [...previouslyActive].some((s) => !activeStreams.has(s));

    const totalDuration = Date.now() - startTime;
    
    console.log(`📈 [${pollId}] Stream changes detected: ${hasChanges} (processed ${processedCount}, added ${addedCount}, ${totalDuration}ms total)`);
    console.log(`📊 [${pollId}] Active streams: [${Array.from(activeStreams).join(', ')}]`);

    if (hasChanges) {
      console.log(`🔔 [${pollId}] Notifying ${changeListeners.size} listeners of stream changes`);
      notifyListeners();
    }
    
    // Log performance metrics for serverless optimization
    if (totalDuration > 5000) {
      console.warn(`⚠️ [${pollId}] Slow poll detected: ${totalDuration}ms (threshold: 5000ms)`);
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [${pollId}] Failed to poll Twitch stream status (${duration}ms):`, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      activeStreamsCount: activeStreams.size,
      listenersCount: changeListeners.size,
      timeSinceLastSuccessfulPoll: lastPollTime > 0 ? now - lastPollTime : 'never'
    });
    
    // Don't clear active streams on error - keep previous state
    // This provides better resilience in serverless environments
    
  } finally {
    // Reset polling flag
    isPolling = false;
    const totalDuration = Date.now() - startTime;
    console.log(`✅ [${pollId}] Poll completed (${totalDuration}ms)`);
  }
}

/**
 * Start the background polling service
 */
export function startPolling(): void {
  console.log('🚀 Starting explicit polling service');
  pollingExplicitlyStarted = true;

  // Initial poll
  pollStreamStatus();

  // Start scheduling polls
  scheduleNextPoll();
}

/**
 * Stop the background polling service
 */
export function stopPolling(): void {
  console.log('🛑 Stopping polling service');
  pollingExplicitlyStarted = false;

  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
  }
}

/**
 * Get poller status and stats
 * Enhanced with serverless-relevant metrics
 */
export function getPollerStatus() {
  const now = Date.now();
  const timeSinceLastPoll = lastPollTime > 0 ? now - lastPollTime : null;
  
  return {
    isPolling: isPolling,
    activeStreamsCount: activeStreams.size,
    activeStreams: Array.from(activeStreams),
    listenersCount: changeListeners.size,
    lastPollTime: lastPollTime > 0 ? new Date(lastPollTime).toISOString() : null,
    isStale: timeSinceLastPoll === null || timeSinceLastPoll > POLL_INTERVAL,
    timeSinceLastPoll: timeSinceLastPoll,
    cacheAge: timeSinceLastPoll !== null ? Math.floor(timeSinceLastPoll / 1000) : null,
    environment: {
      isDev: dev,
      pollInterval: POLL_INTERVAL,
      minPollInterval: MIN_POLL_INTERVAL,
      nodeEnv: process.env.NODE_ENV,
      isServerless: typeof window === 'undefined'
    },
    performance: {
      uptime: process.uptime?.() || 0,
      memoryUsage: process.memoryUsage?.() || null
    }
  };
}

/**
 * Reset poller state (useful for testing)
 */
export function resetPollerState(): void {
  stopPolling();
  activeStreams.clear();
  changeListeners.clear();
  lastPollTime = 0;
  pollingExplicitlyStarted = false;
}

/**
 * Force an immediate poll (useful for testing)
 */
export async function forcePoll(): Promise<void> {
  await pollStreamStatus();
}

// Auto-start polling in server environments when there's no explicit management
// In serverless, polling is triggered on-demand by listeners
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test' && !dev) {
  // For serverless (like Vercel), we don't auto-start polling
  // Instead, polling is triggered when listeners are added
} else if (
  typeof window === 'undefined' &&
  process.env.NODE_ENV !== 'test' &&
  dev
) {
  // In development, keep the old behavior
  console.log('🌟 Auto-starting polling in development mode');
  startPolling();
}
