import {
  getCroppedPlaylistImageUrlServer,
  validateImageUrl,
} from '$lib/server/image-processing';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, request }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const thumbnailMaxResUrl = url.searchParams.get('maxresUrl');
  const responseType = url.searchParams.get('type') || 'image';
  const playlistId = url.searchParams.get('playlistId');
  const imagePropertiesParam = url.searchParams.get('imageProperties');

  if (!thumbnailUrl && !thumbnailMaxResUrl) {
    throw error(400, 'Missing thumbnail URL parameter (url or maxresUrl)');
  }

  const effectiveUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!effectiveUrl || !validateImageUrl(effectiveUrl)) {
    throw error(403, 'Invalid or disallowed image URL');
  }

  try {
    // Parse image properties if provided
    let imageProperties = null;
    if (imagePropertiesParam) {
      try {
        imageProperties = parseImageProperties(imagePropertiesParam);
      } catch (parseError) {
        console.warn('Failed to parse image properties:', parseError);
        imageProperties = null;
      }
    }

    // Process image immediately to provide cropped square playlist image
    const acceptHeader = request.headers.get('accept');
    const croppedImageDataUrl = await getCroppedPlaylistImageUrlServer({
      imageProperties,
      thumbnailMaxResUrl,
      thumbnailUrl,
      acceptHeader,
      options: {
        format: 'auto', // Detect optimal format
        quality: 90,
      },
    });

    // Note: Background processing is handled automatically by database triggers
    // when playlist thumbnail URLs are inserted/updated

    if (responseType === 'image') {
      if (croppedImageDataUrl) {
        // Return the cropped square image directly
        const [mimeType, base64Data] = croppedImageDataUrl.split(',');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const contentType = mimeType.split(':')[1].split(';')[0];

        return new Response(imageBuffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600', // 1 hour cache
            'Content-Length': imageBuffer.length.toString(),
          },
        });
      } else {
        // Fallback to original image if processing fails
        return Response.redirect(effectiveUrl, 302);
      }
    }

    // Return JSON response with processing result
    return json(
      {
        croppedImageUrl: croppedImageDataUrl,
        format: detectOptimalFormat(acceptHeader),
        originalUrl: effectiveUrl,
        imageProperties,
        processed: !!croppedImageDataUrl,
        backgroundProcessing: 'handled by database triggers',
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300', // 5 minute cache for JSON responses
        },
      }
    );
  } catch (err) {
    console.error('Playlist image API error:', err);

    // Fallback to original image if processing fails
    if (responseType === 'image') {
      return Response.redirect(effectiveUrl, 302);
    }

    throw error(500, 'Internal server error');
  }
};
