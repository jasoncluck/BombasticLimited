import {
  getVideoThumbnailWebpUrlServer,
  generateProgressiveImages,
  validateImageUrl,
} from '$lib/server/image-processing';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, request }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const responseType = url.searchParams.get('type') || 'image';

  if (!thumbnailUrl) {
    throw error(400, 'Missing thumbnail URL parameter');
  }

  try {
    // Validate allowed domains for security
    if (!validateImageUrl(thumbnailUrl)) {
      throw error(403, 'Domain not allowed');
    }

    // DISABLED: Server-side processing to prevent SvelteKit server overload
    // Background processing system handles optimization instead
    console.warn(
      '[DEPRECATED] video-thumbnail API called - use background processing system instead'
    );

    // Return redirect to original image to avoid server-side processing
    if (responseType === 'image') {
      return Response.redirect(thumbnailUrl, 302);
    }

    // Return JSON with original URL for backward compatibility
    return json(
      {
        webpUrl: null, // No processed image available
        format: 'jpeg',
        originalUrl: thumbnailUrl,
        deprecated: true,
        message: 'Use background processing system instead',
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300', // Short cache for deprecated endpoint
        },
      }
    );
  } catch (err) {
    console.error('Video thumbnail API error:', err);
    throw error(500, 'Internal server error');
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { thumbnailUrls } = await request.json();

    if (!Array.isArray(thumbnailUrls)) {
      throw error(400, 'Invalid request body: expected array of thumbnailUrls');
    }

    // DISABLED: Batch processing to prevent SvelteKit server overload
    // Background processing system handles optimization instead
    console.warn(
      '[DEPRECATED] video-thumbnail batch API called - use background processing system instead'
    );

    // Return original URLs without processing
    return json(
      {
        webpUrls: thumbnailUrls, // Return original URLs as-is
        processedCount: 0, // No processing done
        totalCount: thumbnailUrls.length,
        deprecated: true,
        message: 'Use background processing system instead',
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300', // Short cache for deprecated endpoint
        },
      }
    );
  } catch (err) {
    console.error('Batch video thumbnail API error:', err);
    throw error(500, 'Internal server error');
  }
};
