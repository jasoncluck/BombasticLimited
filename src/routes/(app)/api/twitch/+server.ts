import { json } from '@sveltejs/kit';
import { getActiveStreams, getPollerStatus, getActiveStreamsWithFreshData } from '$lib/server/twitch-poller';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

// Cache for responses to implement stale-while-revalidate
interface CachedResponse {
  data: string[];
  timestamp: number;
  etag: string;
}

let cachedResponse: CachedResponse | null = null;
const CACHE_MAX_AGE = 30000; // 30 seconds
const STALE_WHILE_REVALIDATE = 300000; // 5 minutes

/**
 * Generate ETag for response caching
 */
function generateETag(data: string[]): string {
  const sortedData = [...data].sort();
  return Buffer.from(JSON.stringify(sortedData)).toString('base64').substring(0, 16);
}

/**
 * GET endpoint to return current live Twitch streams
 * Implements smart caching with stale-while-revalidate strategy optimized for serverless
 */
export const GET: RequestHandler = async ({ request, setHeaders }) => {
  const start = Date.now();
  
  try {
    if (dev) {
      console.log('📡 Twitch API: Getting current live streams');
    }

    // Check if client sent If-None-Match header for ETag validation
    const clientETag = request.headers.get('if-none-match');
    const now = Date.now();

    // Get poller status for debugging and staleness detection
    const pollerStatus = getPollerStatus();
    const isDataStale = pollerStatus.isStale || (pollerStatus.lastPollTime && now - new Date(pollerStatus.lastPollTime).getTime() > CACHE_MAX_AGE);

    if (dev) {
      console.log('🔧 Poller status:', pollerStatus);
      console.log('⏰ Data is stale:', isDataStale);
    }

    // If we have fresh cached data and client ETag matches, return 304
    if (cachedResponse && clientETag === cachedResponse.etag && !isDataStale) {
      if (dev) {
        console.log('✅ Returning 304 Not Modified (ETag match, data fresh)');
      }
      return new Response(null, { status: 304 });
    }

    let activeStreams: string[];
    let shouldUpdateCache = false;

    // Determine caching strategy based on data age and request context
    if (cachedResponse && (now - cachedResponse.timestamp) < STALE_WHILE_REVALIDATE) {
      // We have cached data that's not too old
      if (isDataStale) {
        // Data is stale but within revalidate window - return stale data immediately
        // and trigger background refresh for next request
        activeStreams = cachedResponse.data;
        
        if (dev) {
          console.log('🔄 Returning stale data, triggering background refresh');
        }
        
        // Trigger background refresh (don't await to keep response fast)
        getActiveStreamsWithFreshData().then((freshStreams) => {
          const etag = generateETag(freshStreams);
          cachedResponse = {
            data: freshStreams,
            timestamp: Date.now(),
            etag
          };
          if (dev) {
            console.log('🔄 Background refresh completed, cache updated');
          }
        }).catch((error) => {
          console.error('❌ Background refresh failed:', error);
        });
      } else {
        // Data is fresh enough, use it directly
        activeStreams = cachedResponse.data;
        if (dev) {
          console.log('✅ Using fresh cached data');
        }
      }
    } else {
      // No cache or cache is too old - fetch fresh data
      if (dev) {
        console.log('🔄 Fetching fresh data (no cache or cache too old)');
      }
      
      activeStreams = await getActiveStreamsWithFreshData();
      shouldUpdateCache = true;
    }

    // Update cache if needed
    if (shouldUpdateCache || !cachedResponse) {
      const etag = generateETag(activeStreams);
      cachedResponse = {
        data: activeStreams,
        timestamp: now,
        etag
      };
    }

    const responseETag = cachedResponse.etag;

    // If client ETag matches current data, return 304
    if (clientETag === responseETag) {
      if (dev) {
        console.log('✅ Returning 304 Not Modified (ETag match after refresh)');
      }
      return new Response(null, { status: 304 });
    }

    if (dev) {
      const duration = Date.now() - start;
      console.log(`📊 Twitch API: Current active streams: ${activeStreams} (${duration}ms)`);
    }

    // Set appropriate cache headers for serverless optimization
    const cacheAge = Math.max(0, CACHE_MAX_AGE - (now - cachedResponse.timestamp)) / 1000;
    const maxAge = Math.floor(cacheAge);
    
    setHeaders({
      'ETag': responseETag,
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=300`,
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept-Encoding',
      'X-Cache-Status': shouldUpdateCache ? 'MISS' : 'HIT',
      'X-Data-Age': Math.floor((now - cachedResponse.timestamp) / 1000).toString()
    });

    return json(activeStreams);

  } catch (error) {
    console.error('❌ Failed to get Twitch stream status:', error);

    // Return cached data if available, otherwise empty array
    const fallbackData = cachedResponse?.data || [];
    
    return json(fallbackData, {
      status: cachedResponse ? 200 : 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'ERROR',
        'X-Fallback': cachedResponse ? 'true' : 'false'
      },
    });
  }
};
