import { getMultipleStreamStatus } from '$lib/client/twitch.js';
import { SOURCE_INFO, SOURCES } from '$lib/constants/source.js';
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
// Optimized for webhook-enhanced mode with less frequent backup polling
const STREAM_CHECK_INTERVAL = dev ? 30000 : 600000; // 30 seconds in dev, 10 minutes in production (backup only)
const API_TIMEOUT = 15000; // 15 second timeout for API calls
const MAX_SSE_DURATION = dev ? 120000 : 900000; // 2 minutes in dev, 15 minutes in production (longer since webhooks handle real-time)
const SSE_ITERATION_DELAY = dev ? 5000 : 20000; // 5 seconds in dev, 20 seconds in production (reasonable for webhook-enhanced mode)

if (dev) {
  console.log('🔧 SSE Configuration (Webhook-Enhanced Mode):');
  console.log(`  - Stream check interval (backup): ${STREAM_CHECK_INTERVAL}ms`);
  console.log(`  - SSE iteration delay: ${SSE_ITERATION_DELAY}ms`);
  console.log(`  - Max SSE duration: ${MAX_SSE_DURATION}ms`);
  console.log(`  - Primary updates via webhooks: ${!dev ? 'YES' : 'MIXED (dev)'}`);
  console.log(`  - Estimated iterations per connection: ~${Math.floor(MAX_SSE_DURATION / SSE_ITERATION_DELAY)}`);
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
 * Safely sync local state with webhook state (production only)
 */
async function syncWithWebhookState(): Promise<void> {
  if (dev) return; // Skip in development
  
  try {
    const { getCurrentLiveStreams } = await import('$lib/server/twitch-webhooks.js');
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
      }
    }
    
    // Remove streams that are not live according to webhooks but are in local state
    for (const source of Array.from(streamingSources) as Source[]) {
      if (!webhookSet.has(source)) {
        streamingSources.delete(source);
        hasChanges = true;
      }
    }
    
    if (hasChanges && dev) {
      console.log('📊 SSE: Synced with webhook state:', Array.from(streamingSources));
    }
  } catch (error) {
    console.warn('Failed to sync with webhook state:', error);
  }
}

export async function POST() {
  return produce(
    async function start({ emit }) {
      const startTime = Date.now();

      if (dev) {
        console.log('🚀 SSE: Connection started, will run for up to', MAX_SSE_DURATION / 1000, 'seconds');
      }

      // Subscribe to webhook updates for real-time stream changes (production only)
      let webhookUnsubscribe: (() => void) | null = null;
      
      try {
        // In development, webhooks may not be available, so make this optional
        if (!dev) {
          try {
            // Dynamically import webhook functions to avoid initialization issues
            const { subscribeToStreamUpdates } = await import('$lib/server/twitch-webhooks.js');
            
            // Set up webhook subscription for real-time updates in production
            webhookUnsubscribe = subscribeToStreamUpdates((liveStreams: Source[]) => {
              // Update local state with webhook data
              streamingSources.clear();
              liveStreams.forEach(source => streamingSources.add(source));
              
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
            
            // Initial sync with webhook state in production
            await syncWithWebhookState();
          } catch (error) {
            console.warn('Failed to setup webhook integration (falling back to polling only):', error);
          }
        } else {
          if (dev) {
            console.log('🔧 SSE: Development mode - using polling only (webhooks disabled)');
          }
        }
        
        // Send initial data immediately
        const initialData = Array.from(streamingSources.values());
        const initialJsonData = JSON.stringify(initialData);
        emit('streamingSubscriptions', initialJsonData);
        
        // Initial backup stream status check with timeout
        try {
          await withTimeout(updateStreamStatus(), API_TIMEOUT);
        } catch (error) {
          if (dev) {
            console.log('Initial polling attempt:', error instanceof Error ? error.message : 'Unknown error');
          }
        }
      } catch (error) {
        console.error('Initial SSE setup failed:', error);
        // Don't let setup errors break the SSE connection
      }

      while (true) {
        try {
          // Check if we're approaching the timeout limit
          const elapsed = Date.now() - startTime;
          if (elapsed > MAX_SSE_DURATION) {
            if (dev) {
              console.log(
                `SSE: Approaching timeout limit (${MAX_SSE_DURATION}ms), closing connection gracefully`
              );
            }
            break;
          }

          // Sync with webhook state (primary source of truth) in production
          if (!dev) {
            await syncWithWebhookState();
          }
          
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
              if (dev) {
                console.log('SSE: Client disconnected from stream');
              }
              break;
            } else {
              // This is an actual error we should log
              console.error('SSE emit error:', error);
              break;
            }
          }

          // Run backup polling (more frequent in dev since no webhooks)
          const pollingInterval = dev ? SSE_ITERATION_DELAY : STREAM_CHECK_INTERVAL;
          const shouldRunPolling = dev || (elapsed % pollingInterval < SSE_ITERATION_DELAY);
          
          if (shouldRunPolling) {
            try {
              await withTimeout(updateStreamStatus(), API_TIMEOUT);
            } catch (error) {
              if (dev) {
                console.log('Polling failed:', error instanceof Error ? error.message : 'Unknown error');
              }
              // Don't break on polling failures
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
        if (dev) {
          console.log('Stopping Twitch stream monitoring');
        }
      },
    }
  );
}
