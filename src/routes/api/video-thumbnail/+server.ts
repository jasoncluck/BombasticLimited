import { getVideoThumbnailWebpUrlServer } from '$lib/server/image-processing';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
  const thumbnailUrl = url.searchParams.get('url');

  if (!thumbnailUrl) {
    throw error(400, 'Missing thumbnail URL parameter');
  }

  try {
    const webpUrl = await getVideoThumbnailWebpUrlServer({ thumbnailUrl });

    if (!webpUrl) {
      throw error(500, 'Failed to process video thumbnail');
    }

    return json({ webpUrl });
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
