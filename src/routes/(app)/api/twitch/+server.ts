import { getMultipleStreamStatus } from '$lib/client/twitch.js';
import { SOURCE_INFO, SOURCES } from '$lib/constants/source.js';
import { produce } from 'sveltekit-sse';

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

// Track currently live streams
const streamingSources = new Set<string>();
let lastStreamCheck = 0;
const STREAM_CHECK_INTERVAL = 60000; // Increased to 60 seconds to reduce API load
const API_TIMEOUT = 15000; // 15 second timeout for API calls
const MAX_SSE_DURATION = 5000; // 5 seconds
const SSE_ITERATION_DELAY = 15000; // Increased to 15 seconds to reduce CPU usage

/**
 * Check Twitch stream status for all sources
 */
async function updateStreamStatus(): Promise<void> {
  const now = Date.now();

  // Skip if we've checked recently to avoid excessive API calls
  if (now - lastStreamCheck < STREAM_CHECK_INTERVAL) {
    return;
  }

  lastStreamCheck = now;

  try {
    // Get all Twitch user IDs from sources
    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);

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
      }
    }

    // Log when streams go offline
    for (const prevSource of previouslyLive) {
      if (!streamingSources.has(prevSource)) {
        console.log(`${prevSource} has ended the Twitch stream.`);
      }
    }
  } catch (error) {
    console.error('Failed to update Twitch stream status:', error);
    // Don't throw - let the SSE continue with cached data
  }
}

export async function POST() {
  return produce(
    async function start({ emit }) {
      const startTime = Date.now();

      try {
        // Initial stream status check with timeout
        await withTimeout(updateStreamStatus(), API_TIMEOUT);
      } catch (error) {
        console.error('Initial stream check failed:', error);
      }

      while (true) {
        try {
          // Check if we're approaching Vercel's timeout limit
          const elapsed = Date.now() - startTime;
          if (elapsed > MAX_SSE_DURATION) {
            console.log(
              'Approaching timeout limit, closing SSE connection gracefully'
            );
            break;
          }

          // Check for stream updates with timeout
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
              console.log('Client disconnected from SSE stream');
              break;
            } else {
              // This is an actual error we should log
              console.error('SSE emit error:', error);
              break;
            }
          }

          // Wait before next iteration with longer delay to reduce CPU usage
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
    },
    {
      stop() {
        console.log('Stopping Twitch stream monitoring');
      },
    }
  );
}
