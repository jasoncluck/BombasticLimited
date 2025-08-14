import { getCroppedPlaylistImageUrlServer, validateImageUrl } from '$lib/server/image-processing';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, request }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const thumbnailMaxResUrl = url.searchParams.get('maxresUrl');
  const responseType = url.searchParams.get('type') || 'image';

  if (!thumbnailUrl && !thumbnailMaxResUrl) {
    throw error(400, 'Missing thumbnail URL parameter (url or maxresUrl)');
  }

  const effectiveUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!effectiveUrl || !validateImageUrl(effectiveUrl)) {
    throw error(403, 'Invalid or disallowed image URL');
  }

  try {
    // DISABLED: Server-side processing to prevent SvelteKit server overload
    // Background processing system handles optimization instead
    console.warn('[DEPRECATED] playlist-image API called - use background processing system instead');

    // Return redirect to original image to avoid server-side processing
    if (responseType === 'image') {
      return Response.redirect(effectiveUrl, 302);
    }

    // Return JSON with original URL for backward compatibility
    return json({ 
      webpUrl: null, // No processed image available
      format: 'jpeg',
      originalUrl: effectiveUrl,
      deprecated: true,
      message: 'Use background processing system instead'
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Short cache for deprecated endpoint
      },
    });
  } catch (err) {
    console.error('Playlist image API error:', err);
    throw error(500, 'Internal server error');
  }
};