import { getVideoThumbnailWebpUrlServer } from '$lib/server/image-processing';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, request }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const responseType = url.searchParams.get('type') || 'image'; // 'image' or 'json'

  if (!thumbnailUrl) {
    throw error(400, 'Missing thumbnail URL parameter');
  }

  try {
    // Validate allowed domains for security
    const allowedDomains = [
      'i.ytimg.com',
      'img.youtube.com', 
      'i1.ytimg.com',
      'i2.ytimg.com',
      'i3.ytimg.com',
      'i4.ytimg.com',
      'static-cdn.jtvnw.net',
    ];
    
    const parsedUrl = new URL(thumbnailUrl);
    if (!allowedDomains.includes(parsedUrl.hostname)) {
      throw error(403, 'Domain not allowed');
    }

    const webpDataUrl = await getVideoThumbnailWebpUrlServer({ thumbnailUrl });

    if (!webpDataUrl) {
      throw error(500, 'Failed to process video thumbnail');
    }

    // If requesting image directly, return the binary data
    if (responseType === 'image') {
      // Extract base64 data from data URL
      const base64Data = webpDataUrl.split(',')[1];
      if (!base64Data) {
        throw error(500, 'Invalid processed image data');
      }

      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      return new Response(imageBuffer, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
          'Content-Length': imageBuffer.length.toString(),
          'Vary': 'Accept-Encoding',
          'ETag': `"${Buffer.from(thumbnailUrl).toString('base64').slice(0, 16)}"`, // Simple ETag based on URL
        },
      });
    }

    // Otherwise return JSON (for backwards compatibility)
    return json({ webpUrl: webpDataUrl });
  } catch (err) {
    console.error('Video thumbnail processing error:', err);
    throw error(500, 'Internal server error');
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { thumbnailUrls } = await request.json();

    if (!Array.isArray(thumbnailUrls)) {
      throw error(400, 'Invalid request body: expected array of thumbnailUrls');
    }

    // Process thumbnails in batches
    const { getVideoThumbnailWebpUrlsBatch } = await import(
      '$lib/server/image-processing'
    );
    const webpUrls = await getVideoThumbnailWebpUrlsBatch(thumbnailUrls);

    return json({ webpUrls });
  } catch (err) {
    console.error('Batch video thumbnail processing error:', err);
    throw error(500, 'Internal server error');
  }
};
