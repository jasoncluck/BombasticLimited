import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from '$env/static/public';
import type { Source } from '$lib/constants/source';

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
  return Buffer.from(JSON.stringify(sortedData))
    .toString('base64')
    .substring(0, 16);
}

/**
 * Get active streams from database
 */
async function getActiveStreamsFromDatabase(): Promise<Source[]> {
  // Use local Supabase in development, remote in production
  const supabaseUrl = dev ? 'http://127.0.0.1:54321' : PUBLIC_SUPABASE_URL;
  const supabaseKey = dev
    ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    : PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('active_streams')
    .select('source')
    .eq('is_live', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('❌ Failed to fetch active streams from database:', error);
    throw error;
  }

  return data?.map((row) => row.source as Source) || [];
}

/**
 * GET endpoint to return current live Twitch streams
 * Now reads from the active_streams table instead of server-side polling
 */
export const GET: RequestHandler = async ({ request, setHeaders }) => {
  const start = Date.now();

  try {
    if (dev) {
      console.log('📡 Twitch API: Getting current live streams from database');
    }

    // Check if client sent If-None-Match header for ETag validation
    const clientETag = request.headers.get('if-none-match');
    const now = Date.now();

    // If we have fresh cached data and client ETag matches, return 304
    if (
      cachedResponse &&
      clientETag === cachedResponse.etag &&
      now - cachedResponse.timestamp < CACHE_MAX_AGE
    ) {
      if (dev) {
        console.log('✅ Returning 304 Not Modified (ETag match, data fresh)');
      }
      return new Response(null, { status: 304 });
    }

    let activeStreams: string[];
    let shouldUpdateCache = false;

    // Determine caching strategy based on data age
    if (
      cachedResponse &&
      now - cachedResponse.timestamp < STALE_WHILE_REVALIDATE
    ) {
      // We have cached data that's not too old
      if (now - cachedResponse.timestamp >= CACHE_MAX_AGE) {
        // Data is stale but within revalidate window - return stale data immediately
        // and trigger background refresh for next request
        activeStreams = cachedResponse.data;

        if (dev) {
          console.log('🔄 Returning stale data, triggering background refresh');
        }

        // Trigger background refresh (don't await to keep response fast)
        getActiveStreamsFromDatabase()
          .then((freshStreams) => {
            const etag = generateETag(freshStreams);
            cachedResponse = {
              data: freshStreams,
              timestamp: Date.now(),
              etag,
            };
            if (dev) {
              console.log('🔄 Background refresh completed, cache updated');
            }
          })
          .catch((error) => {
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
        console.log(
          '🔄 Fetching fresh data from database (no cache or cache too old)'
        );
      }

      activeStreams = await getActiveStreamsFromDatabase();
      shouldUpdateCache = true;
    }

    // Update cache if needed
    if (shouldUpdateCache || !cachedResponse) {
      const etag = generateETag(activeStreams);
      cachedResponse = {
        data: activeStreams,
        timestamp: now,
        etag,
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
      console.log(
        `📊 Twitch API: Current active streams: ${activeStreams} (${duration}ms)`
      );
    }

    // Set appropriate cache headers for serverless optimization
    const cacheAge =
      Math.max(0, CACHE_MAX_AGE - (now - cachedResponse.timestamp)) / 1000;
    const maxAge = Math.floor(cacheAge);

    setHeaders({
      ETag: responseETag,
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=300`,
      'Access-Control-Allow-Origin': '*',
      Vary: 'Accept-Encoding',
      'X-Cache-Status': shouldUpdateCache ? 'MISS' : 'HIT',
      'X-Data-Age': Math.floor(
        (now - cachedResponse.timestamp) / 1000
      ).toString(),
      'X-Data-Source': 'database',
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
        'X-Fallback': cachedResponse ? 'true' : 'false',
        'X-Data-Source': 'database',
      },
    });
  }
};
