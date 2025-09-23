import { json } from '@sveltejs/kit';
import { getActiveStreams } from '$lib/server/twitch-poller.js';
import { dev } from '$app/environment';

/**
 * GET endpoint to return current live Twitch streams
 * Replaces the complex SSE implementation with simple polling
 */
export async function GET() {
  try {
    if (dev) {
      console.log('📡 Twitch API: Getting current live streams');
    }

    // Get current active streams from the poller
    const activeStreams = getActiveStreams();

    if (dev) {
      console.log('📊 Twitch API: Current active streams:', activeStreams);
    }

    return json(activeStreams, {
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Failed to get Twitch stream status:', error);
    
    // Return empty array on error to prevent client-side issues
    return json([], {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
