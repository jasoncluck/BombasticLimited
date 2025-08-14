import { getVideoThumbnailWebpUrlServer, generateProgressiveImages, validateImageUrl } from '$lib/server/image-processing';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, request }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const responseType = url.searchParams.get('type') || 'image'; // 'image', 'json', or 'progressive'
  const format =
    (url.searchParams.get('format') as 'auto' | 'webp' | 'jpeg' | 'avif') ||
    'auto';
  const quality = parseInt(url.searchParams.get('quality') || '90');
  const width = url.searchParams.get('width')
    ? parseInt(url.searchParams.get('width')!)
    : undefined;
  const height = url.searchParams.get('height')
    ? parseInt(url.searchParams.get('height')!)
    : undefined;

  if (!thumbnailUrl) {
    throw error(400, 'Missing thumbnail URL parameter');
  }

  // Validate quality parameter
  if (quality < 10 || quality > 100) {
    throw error(400, 'Quality must be between 10 and 100');
  }

  try {
    // Validate allowed domains for security (now centralized in image-processing module)
    if (!validateImageUrl(thumbnailUrl)) {
      throw error(403, 'Domain not allowed');
    }

    // Get Accept header for format detection
    const acceptHeader = request.headers.get('accept');
    
    // Handle progressive images response
    if (responseType === 'progressive') {
      const progressiveImages = await generateProgressiveImages(thumbnailUrl, [
        { width: 320, height: 180, quality: 75 },
        { width: 640, height: 360, quality: 85 },
        { width: 1280, height: 720, quality: 90 },
      ], acceptHeader);

      return json(
        {
          progressiveImages,
          originalUrl: thumbnailUrl,
        },
        {
          headers: {
            'Cache-Control':
              'public, max-age=86400, stale-while-revalidate=604800', // 24h cache, 7d stale
            Vary: 'Accept',
          },
        }
      );
    }

    // Process single image
    const dataUrl = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl,
      options: {
        format,
        quality,
        width,
        height,
      },
      acceptHeader,
    });

    if (!dataUrl) {
      throw error(500, 'Failed to process video thumbnail');
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

      return new Response(imageBuffer, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache for processed images
          'Content-Length': imageBuffer.length.toString(),
          Vary: 'Accept',
          ETag: `"${Buffer.from(thumbnailUrl + actualFormat + quality).toString('base64').slice(0, 16)}"`,
        },
      });
    }

    // Return JSON (for backwards compatibility)
    const actualFormat = format === 'auto' ? detectOptimalFormat(acceptHeader) : format;
    return json({ 
      webpUrl: dataUrl,
      format: actualFormat,
      originalUrl: thumbnailUrl 
    }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // 24h cache, 7d stale
        Vary: 'Accept',
      },
    });
  } catch (err) {
    console.error('Video thumbnail processing error:', err);
    throw error(500, 'Internal server error');
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { thumbnailUrls, options = {} } = await request.json();

    if (!Array.isArray(thumbnailUrls)) {
      throw error(400, 'Invalid request body: expected array of thumbnailUrls');
    }

    // Validate batch size
    if (thumbnailUrls.length > 50) {
      throw error(400, 'Batch size too large: maximum 50 URLs allowed');
    }

    // Get Accept header for format detection
    const acceptHeader = request.headers.get('accept');

    // Process thumbnails in batches with enhanced options
    const { getVideoThumbnailWebpUrlsBatch } = await import(
      '$lib/server/image-processing'
    );
    
    const webpUrls = await getVideoThumbnailWebpUrlsBatch(thumbnailUrls, options, acceptHeader);

    return json({ 
      webpUrls,
      processedCount: webpUrls.filter(url => url !== null).length,
      totalCount: thumbnailUrls.length 
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400', // 1h cache, 24h stale
        Vary: 'Accept',
      },
    });
  } catch (err) {
    console.error('Batch video thumbnail processing error:', err);
    throw error(500, 'Internal server error');
  }
};
