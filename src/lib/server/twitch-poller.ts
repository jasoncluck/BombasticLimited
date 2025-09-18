/**
 * Background Twitch stream poller optimized for serverless environments like Vercel
 * Uses stateless polling with shared state management
 */

import { getMultipleStreamStatus } from '$lib/client/twitch.js';
import { SOURCE_INFO, SOURCES, type Source } from '$lib/constants/source.js';
import { dev } from '$app/environment';

// Global state for active streams - this persists across requests within the same instance
let activeStreams = new Set<Source>();
let lastPollTime = 0;
let isPolling = false;
let pollingTimeout: NodeJS.Timeout | null = null;

// Configuration optimized for serverless
const POLL_INTERVAL = 60000; // 1 minute
const MIN_POLL_INTERVAL = 5000; // Minimum 5 seconds between polls
const SERVERLESS_POLL_INTERVAL = dev ? 120000 : 90000; // Longer intervals in serverless (2 min dev, 1.5 min prod)

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
 * Get current active streams
 */
export function getActiveStreams(): Source[] {
  // Trigger a poll if data is stale
  triggerPollIfNeeded();
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

  // If we have listeners and data is stale, poll immediately
  if (changeListeners.size > 0 && timeSinceLastPoll > POLL_INTERVAL) {
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

  const interval = dev ? POLL_INTERVAL : SERVERLESS_POLL_INTERVAL;

  pollingTimeout = setTimeout(() => {
    pollingTimeout = null;
    if (changeListeners.size > 0) {
      pollStreamStatus();
      scheduleNextPoll(); // Schedule next poll
    }
  }, interval);
}

/**
 * Poll Twitch API for stream status updates
 */
async function pollStreamStatus(): Promise<void> {
  const now = Date.now();

  // Prevent excessive polling
  if (now - lastPollTime < MIN_POLL_INTERVAL) {
    return;
  }

  lastPollTime = now;

  try {
    // Get all Twitch user IDs from sources
    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);

    // Fetch stream status for all sources
    const streamStatuses = await getMultipleStreamStatus(twitchIds);

    // Handle case where API returns undefined/null
    if (!streamStatuses || !Array.isArray(streamStatuses)) {
      return;
    }

    // Track previous state for change detection
    const previouslyActive = new Set(activeStreams);
    activeStreams.clear();

    // Update active streams
    for (const status of streamStatuses) {
      const sourceName = SOURCES.find(
        (source) => SOURCE_INFO[source].twitchId === status.userId
      );

      if (sourceName && status.isLive) {
        activeStreams.add(sourceName);
      }
    }

    // Only notify if there were changes
    const hasChanges =
      activeStreams.size !== previouslyActive.size ||
      [...activeStreams].some((s) => !previouslyActive.has(s)) ||
      [...previouslyActive].some((s) => !activeStreams.has(s));

    if (hasChanges) {
      notifyListeners();
    }
  } catch (error) {
    console.error('Failed to poll Twitch stream status:', error);
  }
}

/**
 * Start the background polling service
 */
export function startPolling(): void {
  // Initial poll
  pollStreamStatus();

  // Start scheduling polls
  scheduleNextPoll();
}

/**
 * Stop the background polling service
 */
export function stopPolling(): void {
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
  }
}

/**
 * Get poller status and stats
 */
export function getPollerStatus() {
  return {
    activeStreamsCount: activeStreams.size,
    activeStreams: Array.from(activeStreams),
    listenersCount: changeListeners.size,
    lastPollTime:
      lastPollTime > 0 ? new Date(lastPollTime).toISOString() : null,
    isStale: Date.now() - lastPollTime > POLL_INTERVAL,
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
  startPolling();
}
