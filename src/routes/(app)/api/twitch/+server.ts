import { getMultipleStreamStatus } from '$lib/client/twitch.js';
import { SOURCE_INFO, SOURCES } from '$lib/constants/source.js';
import { subscribeToStreamUpdates, getCurrentLiveStreams } from '$lib/server/twitch-webhooks.js';
import { produce } from 'sveltekit-sse';
import { dev } from '$app/environment';
import type { Source } from '$lib/constants/source.js';

/**
 * @param {number} milliseconds
 * @returns
 */
function delay(milliseconds: number) {
  return new Promise(function run(resolve) {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Promise with timeout wrapper
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

// Track currently live streams - now primarily driven by webhooks
const streamingSources = new Set<string>();
let lastStreamCheck = 0;

// Configuration that adapts to dev vs production
// Reduced polling frequency since webhooks handle real-time updates
const STREAM_CHECK_INTERVAL = dev ? 30000 : 600000; // 30 seconds in dev, 10 minutes in production (backup only)
const API_TIMEOUT = 15000; // 15 second timeout for API calls
const MAX_SSE_DURATION = dev ? 120000 : 300000; // 2 minutes in dev, 5 minutes in production
const SSE_ITERATION_DELAY = dev ? 5000 : 30000; // 5 seconds in dev, 30 seconds in production (less frequent updates)

if (dev) {
  console.log('🔧 SSE Configuration (Webhook-Enhanced Mode):');
  console.log(`  - Stream check interval (backup): ${STREAM_CHECK_INTERVAL}ms`);
  console.log(`  - SSE iteration delay: ${SSE_ITERATION_DELAY}ms`);
  console.log(`  - Max SSE duration: ${MAX_SSE_DURATION}ms`);
  console.log(`  - Primary updates via webhooks: ${!dev ? 'YES' : 'MIXED (dev)'}`);
}

/**
 * Check Twitch stream status for all sources (now used as backup to webhooks)
 */
async function updateStreamStatus(): Promise<void> {
  const now = Date.now();

  // Skip if we've checked recently - this is now primarily a backup mechanism
  if (now - lastStreamCheck < STREAM_CHECK_INTERVAL) {
    return;
  }

  lastStreamCheck = now;

  try {
    // Get all Twitch user IDs from sources
    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);

    if (dev) {
      console.log('🔍 SSE: Backup stream status check for:', twitchIds);
    }

    // Fetch stream status for all sources with timeout
    const streamStatuses = await withTimeout(
      getMultipleStreamStatus(twitchIds),
      API_TIMEOUT
    );

    // Update the streaming sources set
    const previouslyLive = new Set(streamingSources);
    streamingSources.clear();

    for (const status of streamStatuses) {
      // Find the source name by matching twitchId
      const sourceName = SOURCES.find(
        (source) => SOURCE_INFO[source].twitchId === status.userId
      );

      if (sourceName && status.isLive) {
        streamingSources.add(sourceName);

        // Log new streams in dev mode
        if (dev && !previouslyLive.has(sourceName)) {
          console.log(`🔴 SSE: ${sourceName} started streaming (backup detection)`);
        }
      }
    }

    // Log when streams go offline
    for (const prevSource of previouslyLive) {
      if (!streamingSources.has(prevSource)) {
        console.log(`⚫ SSE: ${prevSource} ended the Twitch stream (backup detection)`);
      }
    }

    if (dev) {
      console.log('📊 SSE: Current streaming sources (backup):', Array.from(streamingSources));
    }
  } catch (error) {
    console.error('Failed to update Twitch stream status (backup):', error);
    // Don't throw - let the SSE continue with cached data
  }
}

/**
 * Sync local state with webhook state
 */
function syncWithWebhookState(): void {
  const webhookStreams = getCurrentLiveStreams();
  const webhookSet = new Set(webhookStreams);
  
  // Check if there are differences between local state and webhook state
  const localSet = new Set(Array.from(streamingSources));
  
  let hasChanges = false;
  
  // Add streams that are live according to webhooks but not in local state
  for (const source of webhookStreams) {
    if (!localSet.has(source)) {
      streamingSources.add(source);
      hasChanges = true;
      if (dev) {
        console.log(`🔄 SSE: Added ${source} from webhook state`);
      }
    }
  }
  
  // Remove streams that are not live according to webhooks but are in local state
  for (const source of Array.from(streamingSources) as Source[]) {
    if (!webhookSet.has(source)) {
      streamingSources.delete(source);
      hasChanges = true;
      if (dev) {
        console.log(`🔄 SSE: Removed ${source} from webhook state`);
      }
    }
  }
  
  if (hasChanges && dev) {
    console.log('📊 SSE: Synced with webhook state:', Array.from(streamingSources));
  }
}

export async function POST() {
  return produce(
    async function start({ emit }) {
      const startTime = Date.now();

      if (dev) {
        console.log('🚀 SSE: Connection started, will run for up to', MAX_SSE_DURATION / 1000, 'seconds');
      }

      // Subscribe to webhook updates for real-time stream changes
      let webhookUnsubscribe: (() => void) | null = null;
      
      try {
        // Set up webhook subscription for real-time updates
        webhookUnsubscribe = subscribeToStreamUpdates((liveStreams: Source[]) => {
          // Update local state with webhook data
          streamingSources.clear();
          liveStreams.forEach(source => streamingSources.add(source));
          
          if (dev) {
            console.log('🔄 SSE: Received webhook update:', liveStreams);
          }
          
          // Emit updated data immediately
          const jsonData = JSON.stringify(liveStreams);
          const { error } = emit('streamingSubscriptions', jsonData);
          
          if (error) {
            const isClientDisconnection =
              error.message?.includes('Client disconnected') ||
              error.message?.includes('Connection closed') ||
              error.message?.includes('stream closed');
              
            if (!isClientDisconnection) {
              console.error('SSE webhook emit error:', error);
            }
          }
        });

        // Initial sync with webhook state
        syncWithWebhookState();
        
        // Initial backup stream status check with timeout
        await withTimeout(updateStreamStatus(), API_TIMEOUT);
      } catch (error) {
        console.error('Initial stream check failed:', error);
      }

      while (true) {
        try {
          // Check if we're approaching the timeout limit
          const elapsed = Date.now() - startTime;
          if (elapsed > MAX_SSE_DURATION) {
            console.log(
              `SSE: Approaching timeout limit (${MAX_SSE_DURATION}ms), closing connection gracefully`
            );
            break;
          }

          // Sync with webhook state (primary source of truth)
          syncWithWebhookState();
          
          // Periodically run backup polling (much less frequent now)
          await withTimeout(updateStreamStatus(), API_TIMEOUT);

          // Prepare the data to send
          const streamingData = Array.from(streamingSources.values());
          const jsonData = JSON.stringify(streamingData);

          // Emit current streaming sources with error handling
          const { error } = emit('streamingSubscriptions', jsonData);

          if (error) {
            // Check if it's a client disconnection (normal) vs actual error
            const isClientDisconnection =
              error.message?.includes('Client disconnected') ||
              error.message?.includes('Connection closed') ||
              error.message?.includes('stream closed') ||
              error.message?.includes('Client disconnected from the stream');

            if (isClientDisconnection) {
              // This is normal - client closed the connection
              console.log('SSE: Client disconnected from stream');
              break;
            } else {
              // This is an actual error we should log
              console.error('SSE emit error:', error);
              break;
            }
          }

          // Wait before next iteration with appropriate delay
          await delay(SSE_ITERATION_DELAY);
        } catch (loopError) {
          console.error('Error in SSE loop:', loopError);

          // If it's a timeout error, break gracefully
          if (
            loopError instanceof Error &&
            loopError.message.includes('timed out')
          ) {
            console.log('Breaking SSE loop due to timeout');
            break;
          }

          // For other errors, also break to prevent infinite error loops
          break;
        }
      }
      
      // Clean up webhook subscription
      if (webhookUnsubscribe) {
        webhookUnsubscribe();
      }
    },
    {
      stop() {
        console.log('Stopping Twitch stream monitoring');
      },
    }
  );
}
