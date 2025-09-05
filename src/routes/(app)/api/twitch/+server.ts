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

// Track currently live streams
const streamingSources = new Set<string>();
let lastStreamCheck = 0;
const STREAM_CHECK_INTERVAL = 45000; // 45 seconds between API checks

/**
 * Check Twitch stream status for all sources
 */
async function updateStreamStatus() {
  const now = Date.now();

  // Skip if we've checked recently to avoid excessive API calls
  if (now - lastStreamCheck < STREAM_CHECK_INTERVAL) {
    return;
  }

  lastStreamCheck = now;

  try {
    // Get all Twitch user IDs from sources
    const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);

    // Fetch stream status for all sources
    const streamStatuses = await getMultipleStreamStatus(twitchIds);

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
  }
}

export async function POST() {
  return produce(
    async function start({ emit }) {
      // Initial stream status check
      await updateStreamStatus();

      while (true) {
        try {
          // Check for stream updates
          await updateStreamStatus();

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
              return;
            } else {
              // This is an actual error we should log
              console.error('SSE emit error:', error);
              return;
            }
          }

          // Wait before next iteration (shorter than API check interval for responsive SSE)
          await delay(10000);
        } catch (loopError) {
          console.error('Error in SSE loop:', loopError);
          // Break the loop on unexpected errors to prevent infinite error loops
          return;
        }
      }
    },
    {
      stop() {
        // console.log('Stopping Twitch stream monitoring');
      },
    }
  );
}
