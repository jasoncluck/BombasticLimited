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
// Production timeout is more aggressive to prevent Vercel timeouts
const STREAM_CHECK_INTERVAL = dev ? 30000 : 180000; // 3 minutes backup polling in production
const API_TIMEOUT = 10000; // Reduced to 10 seconds for faster failures
const MAX_SSE_DURATION = dev ? 120000 : 120000; // 2 minutes for both
const SSE_ITERATION_DELAY = dev ? 5000 : 20000; // 20 seconds in production
const GRACEFUL_SHUTDOWN_BUFFER = 5000; // 5 seconds buffer for cleanup

if (dev || process.env.NODE_ENV !== 'production') {
  console.log('🔧 SSE Configuration (Webhook-Enhanced Mode):');
  console.log(`  - Stream check interval (backup): ${STREAM_CHECK_INTERVAL}ms`);
  console.log(`  - SSE iteration delay: ${SSE_ITERATION_DELAY}ms`);
  console.log(
    `  - Max SSE duration: ${MAX_SSE_DURATION}ms ${!dev ? '(Vercel timeout prevention)' : ''}`
  );
  console.log(
    `  - Primary updates via webhooks: ${!dev ? 'YES' : 'MIXED (dev)'}`
  );
  console.log(
    `  - Estimated iterations per connection: ~${Math.floor(MAX_SSE_DURATION / SSE_ITERATION_DELAY)}`
  );
  console.log(`  - API timeout: ${API_TIMEOUT}ms`);
  console.log(`  - Graceful shutdown buffer: ${GRACEFUL_SHUTDOWN_BUFFER}ms`);
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

    // Fetch stream status for all sources with reduced timeout
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
          console.log(
            `🔴 SSE: ${sourceName} started streaming (backup detection)`
          );
        }
      }
    }

    // Log when streams go offline
    for (const prevSource of previouslyLive) {
      if (!streamingSources.has(prevSource)) {
        console.log(
          `⚫ SSE: ${prevSource} ended the Twitch stream (backup detection)`
        );
      }
    }

    if (dev) {
      console.log(
        '📊 SSE: Current streaming sources (backup):',
        Array.from(streamingSources)
      );
    }
  } catch (error) {
    console.error('Failed to update Twitch stream status (backup):', error);
    // Don't throw - let the SSE continue with cached data
  }
}

/**
 * Initialize webhook state on server start (production only)
 */
async function initializeWebhooksIfNeeded(): Promise<void> {
  if (dev) return; // Skip in development

  try {
    const { initializeWebhookState } = await import(
      '$lib/server/twitch-webhooks.js'
    );

    // Add timeout to webhook initialization to prevent hanging
    await withTimeout(initializeWebhookState(), 5000);
  } catch (error) {
    console.warn(
      'Failed to initialize webhook state (timeout or error):',
      error
    );
  }
}

/**
 * Safely sync local state with webhook state (production only)
 */
async function syncWithWebhookState(): Promise<void> {
  if (dev) return; // Skip in development

  try {
    const { getCurrentLiveStreams } = await import(
      '$lib/server/twitch-webhooks.js'
    );
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
      console.log(
        '📊 SSE: Synced with webhook state:',
        Array.from(streamingSources)
      );
    }
  } catch (error) {
    console.warn('Failed to sync with webhook state:', error);
  }
}

// Initialize webhooks on module load (production only) with timeout protection
if (!dev) {
  initializeWebhooksIfNeeded().catch((error) => {
    console.warn('Failed to initialize webhooks on startup:', error);
  });
}

export async function POST() {
  return produce(
    async function start({ emit }) {
      const startTime = Date.now();
      let iterationCount = 0;

      if (dev) {
        console.log(
          '🚀 SSE: Connection started, will run for up to',
          MAX_SSE_DURATION / 1000,
          'seconds'
        );
      }

      // Subscribe to webhook updates for real-time stream changes (production only)
      let webhookUnsubscribe: (() => void) | null = null;

      try {
        // In development, webhooks may not be available, so make this optional
        if (!dev) {
          try {
            // Dynamically import webhook functions to avoid initialization issues
            const { subscribeToStreamUpdates } = await import(
              '$lib/server/twitch-webhooks.js'
            );

            if (dev) {
              console.log(
                '🔧 SSE: Setting up webhook subscription in production mode'
              );
            }

            // Set up webhook subscription for real-time updates in production
            webhookUnsubscribe = subscribeToStreamUpdates(
              (liveStreams: Source[]) => {
                // Update local state with webhook data
                streamingSources.clear();
                liveStreams.forEach((source) => streamingSources.add(source));

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
              }
            );

            // Initial sync with webhook state in production with timeout
            await withTimeout(syncWithWebhookState(), 3000);

            if (dev) {
              console.log(
                '🟢 SSE: Webhook integration setup completed successfully'
              );
            }
          } catch (error) {
            console.warn(
              'Failed to setup webhook integration (falling back to polling only):',
              error
            );
            // This should not break the SSE connection - just fall back to polling
          }
        } else {
          if (dev) {
            console.log(
              '🔧 SSE: Development mode - using polling only (webhooks disabled)'
            );
          }
        }

        // Send initial data immediately
        const initialData = Array.from(streamingSources.values());
        const initialJsonData = JSON.stringify(initialData);

        try {
          const { error: initialEmitError } = emit(
            'streamingSubscriptions',
            initialJsonData
          );
          if (initialEmitError) {
            console.warn('Initial SSE emit error:', initialEmitError);
            // Don't break the connection for initial emit errors
          } else {
            if (dev) {
              console.log('📡 SSE: Initial data sent successfully');
            }
          }
        } catch (emitError) {
          console.warn('Failed to send initial SSE data:', emitError);
          // Don't break the connection
        }

        // Initial backup stream status check with timeout
        try {
          await withTimeout(updateStreamStatus(), API_TIMEOUT);
        } catch (error) {
          if (dev) {
            console.log(
              'Initial polling attempt:',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      } catch (error) {
        console.error('Initial SSE setup failed:', error);
        // Don't let setup errors break the SSE connection
      }

      while (true) {
        try {
          // Check if we're approaching the timeout limit with buffer for cleanup
          const elapsed = Date.now() - startTime;
          if (elapsed > MAX_SSE_DURATION - GRACEFUL_SHUTDOWN_BUFFER) {
            if (dev) {
              console.log(
                `🕒 SSE: Approaching timeout limit (${MAX_SSE_DURATION}ms), closing connection gracefully after ${iterationCount} iterations`
              );
            }
            break;
          }

          iterationCount++;

          // Sync with webhook state (primary source of truth) in production with timeout
          if (!dev) {
            try {
              await withTimeout(syncWithWebhookState(), 2000);
            } catch (syncError) {
              if (dev) {
                console.log('Webhook sync timeout/error:', syncError);
              }
              // Continue without breaking the connection
            }
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

          // Run backup polling with more aggressive timeout handling
          const pollingInterval = dev
            ? SSE_ITERATION_DELAY
            : STREAM_CHECK_INTERVAL;
          const shouldRunPolling =
            dev || elapsed % pollingInterval < SSE_ITERATION_DELAY;

          if (shouldRunPolling) {
            try {
              await withTimeout(updateStreamStatus(), API_TIMEOUT);
            } catch (error) {
              if (dev) {
                console.log(
                  'Polling failed (continuing):',
                  error instanceof Error ? error.message : 'Unknown error'
                );
              }
              // Don't break on polling failures, but log them
            }
          }

          // Check again if we should exit before waiting
          const elapsedAfterWork = Date.now() - startTime;
          if (elapsedAfterWork > MAX_SSE_DURATION - GRACEFUL_SHUTDOWN_BUFFER) {
            if (dev) {
              console.log(
                `🕒 SSE: Time budget exhausted, exiting after ${iterationCount} iterations`
              );
            }
            break;
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
        try {
          webhookUnsubscribe();
        } catch (cleanupError) {
          console.warn('Error during webhook cleanup:', cleanupError);
        }
      }

      const totalElapsed = Date.now() - startTime;
      if (dev) {
        console.log(
          `🏁 SSE: Connection ended after ${totalElapsed}ms (${iterationCount} iterations)`
        );
      }
    },
    {
      stop() {
        if (dev) {
          console.log('🛑 SSE: Stopping Twitch stream monitoring');
        }
      },
    }
  );
}
