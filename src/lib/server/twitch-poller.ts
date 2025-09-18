/**
 * Background Twitch stream poller following Vercel recommended patterns
 * Runs independently of SSE connections and maintains stream state
 */

import { getMultipleStreamStatus } from '$lib/client/twitch.js';
import { SOURCE_INFO, SOURCES, type Source } from '$lib/constants/source.js';
import { dev } from '$app/environment';

// Global state for active streams
let activeStreams = new Set<Source>();
let isPolling = false;
let pollingInterval: NodeJS.Timeout | null = null;
let lastPollTime = 0;

// Configuration
const POLL_INTERVAL = dev ? 60000 : 60000; // 1 minute in both dev and production for consistency
const MIN_POLL_INTERVAL = 5000; // Minimum 5 seconds between polls to prevent excessive API calls

// Event listeners for stream changes
type StreamChangeListener = (activeStreams: Source[]) => void;
const changeListeners = new Set<StreamChangeListener>();

/**
 * Add a listener for stream changes
 */
export function addStreamChangeListener(listener: StreamChangeListener): () => void {
  changeListeners.add(listener);
  
  // Return cleanup function
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Get current active streams
 */
export function getActiveStreams(): Source[] {
  return Array.from(activeStreams);
}

/**
 * Notify all listeners of stream changes
 */
function notifyListeners() {
  const currentStreams = Array.from(activeStreams);
  changeListeners.forEach(listener => {
    try {
      listener(currentStreams);
    } catch (error) {
      console.error('Error in stream change listener:', error);
    }
  });
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
    
    if (dev) {
      console.log('🔍 Poller: Checking stream status for:', twitchIds);
    }
    
    // Fetch stream status for all sources
    const streamStatuses = await getMultipleStreamStatus(twitchIds);
    
    // Handle case where API returns undefined/null
    if (!streamStatuses || !Array.isArray(streamStatuses)) {
      if (dev) {
        console.log('⚠️ Poller: No stream status data received');
      }
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
        
        // Log new streams
        if (dev && !previouslyActive.has(sourceName)) {
          console.log(`🔴 Poller: ${sourceName} started streaming`);
        }
      }
    }
    
    // Log streams that went offline
    if (dev) {
      for (const prevSource of previouslyActive) {
        if (!activeStreams.has(prevSource)) {
          console.log(`⚫ Poller: ${prevSource} ended streaming`);
        }
      }
      
      console.log('📊 Poller: Current active streams:', Array.from(activeStreams));
    }
    
    // Only notify if there were changes
    const hasChanges = activeStreams.size !== previouslyActive.size || 
                       [...activeStreams].some(s => !previouslyActive.has(s)) ||
                       [...previouslyActive].some(s => !activeStreams.has(s));
    
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
  if (isPolling) {
    return;
  }
  
  isPolling = true;
  
  if (dev) {
    console.log(`🚀 Twitch poller started - checking every ${POLL_INTERVAL}ms`);
  }
  
  // Initial poll
  pollStreamStatus();
  
  // Set up interval polling
  pollingInterval = setInterval(pollStreamStatus, POLL_INTERVAL);
}

/**
 * Stop the background polling service
 */
export function stopPolling(): void {
  if (!isPolling) {
    return;
  }
  
  isPolling = false;
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  if (dev) {
    console.log('⏹️ Twitch poller stopped');
  }
}

/**
 * Get poller status and stats
 */
export function getPollerStatus() {
  return {
    isPolling,
    activeStreamsCount: activeStreams.size,
    activeStreams: Array.from(activeStreams),
    listenersCount: changeListeners.size,
    lastPollTime: lastPollTime > 0 ? new Date(lastPollTime).toISOString() : null,
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

// Auto-start polling in server environments
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  startPolling();
}