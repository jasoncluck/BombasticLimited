import { getCroppedPlaylistImageUrlServer, detectOptimalFormat, validateImageUrl } from '$lib/server/image-processing';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, request }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const thumbnailMaxResUrl = url.searchParams.get('maxresUrl');
  const responseType = url.searchParams.get('type') || 'image'; // 'image' or 'json'
  const format = url.searchParams.get('format') as 'auto' | 'webp' | 'jpeg' | 'avif' || 'auto';
  const quality = parseInt(url.searchParams.get('quality') || '90');
  const imagePropertiesParam = url.searchParams.get('imageProperties');

  if (!thumbnailUrl && !thumbnailMaxResUrl) {
    throw error(400, 'Missing thumbnail URL parameter (url or maxresUrl)');
  }

  // Validate quality parameter
  if (quality < 10 || quality > 100) {
    throw error(400, 'Quality must be between 10 and 100');
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
        imageProperties = parseImageProperties(JSON.parse(decodeURIComponent(imagePropertiesParam)));
      } catch (err) {
        console.warn('Failed to parse image properties:', err);
      }
    }

    // Get Accept header for format detection
    const acceptHeader = request.headers.get('accept');
    
    // Process playlist image with cropping
    const dataUrl = await getCroppedPlaylistImageUrlServer({
      imageProperties,
      thumbnailMaxResUrl,
      thumbnailUrl,
      acceptHeader,
      options: {
        format,
        quality,
      },
    });

    if (!dataUrl) {
      throw error(500, 'Failed to process playlist image');
    }

    // Return image directly
    if (responseType === 'image') {
      // Extract base64 data from data URL
      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) {
        throw error(500, 'Invalid processed image data');
      }

      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Determine content type from data URL
      const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/webp';

      // Determine the actual format used for ETag generation
      const actualFormat = format === 'auto' ? detectOptimalFormat(acceptHeader) : format;

      // Create cache key from all parameters that affect the output
      const cacheKeyParams = [
        effectiveUrl,
        actualFormat,
        quality,
        imagePropertiesParam || 'default'
      ].join('|');
      
      return new Response(imageBuffer, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache for processed images
          'Content-Length': imageBuffer.length.toString(),
          Vary: 'Accept',
          ETag: `"${Buffer.from(cacheKeyParams).toString('base64').slice(0, 16)}"`,
        },
      });
    }

    // Return JSON (for backwards compatibility)
    const actualFormat = format === 'auto' ? detectOptimalFormat(acceptHeader) : format;
    return json({ 
      webpUrl: dataUrl,
      format: actualFormat,
      originalUrl: effectiveUrl 
    }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // 24h cache, 7d stale
        Vary: 'Accept',
      },
    });
  } catch (err) {
    console.error('Playlist image processing error:', err);
    throw error(500, 'Internal server error');
  }
};