import {
  getVideoThumbnailWebpUrl,
  getVideoThumbnailWebpUrlsBatch,
} from '../playlist/playlist-service';
import type { Video } from '$lib/supabase/videos';
import { browser } from '$app/environment';

// Cache for processed video thumbnails to avoid reprocessing
const processedThumbnailCache = new Map<string, string | null>();

// Type extension for videos with processed thumbnails
export type VideoWithProcessedThumbnail = Video & {
  processedThumbnailUrl?: string | null;
};

/**
 * Process a single video thumbnail to WebP format using server-side processing
 */
export async function processVideoThumbnail(
  video: Video
): Promise<VideoWithProcessedThumbnail> {
  if (!video.thumbnail_url) {
    return { ...video, processedThumbnailUrl: null };
  }

  // Check cache first
  const cached = processedThumbnailCache.get(video.thumbnail_url);
  if (cached !== undefined) {
    return { ...video, processedThumbnailUrl: cached };
  }

  try {
    // Try server-side processing first
    const processedUrl = await getVideoThumbnailWebpUrlServer(
      video.thumbnail_url
    );

    if (processedUrl) {
      // Cache the result
      processedThumbnailCache.set(video.thumbnail_url, processedUrl);
      return { ...video, processedThumbnailUrl: processedUrl };
    }

    // Fallback to client-side processing if server-side fails
    const clientProcessedUrl = await getVideoThumbnailWebpUrl({
      thumbnailUrl: video.thumbnail_url,
    });

    // Cache the result
    processedThumbnailCache.set(video.thumbnail_url, clientProcessedUrl);

    return { ...video, processedThumbnailUrl: clientProcessedUrl };
  } catch (error) {
    console.error('Failed to process video thumbnail:', error);
    // Cache the failure to avoid retrying
    processedThumbnailCache.set(video.thumbnail_url, null);
    return { ...video, processedThumbnailUrl: null };
  }
}

/**
 * Process multiple video thumbnails to WebP format in batches
 */
export async function processVideoThumbnails(
  videos: Video[]
): Promise<VideoWithProcessedThumbnail[]> {
  if (videos.length === 0) return [];

  // Separate cached and uncached videos
  const uncachedVideos: Video[] = [];
  const uncachedUrls: (string | null)[] = [];
  const results: VideoWithProcessedThumbnail[] = [];

  // First pass: check cache and prepare uncached items
  for (const video of videos) {
    if (!video.thumbnail_url) {
      results.push({ ...video, processedThumbnailUrl: null });
      continue;
    }

    const cached = processedThumbnailCache.get(video.thumbnail_url);
    if (cached !== undefined) {
      results.push({ ...video, processedThumbnailUrl: cached });
    } else {
      uncachedVideos.push(video);
      uncachedUrls.push(video.thumbnail_url);
    }
  }

  // Process uncached thumbnails in batch
  if (uncachedUrls.length > 0) {
    try {
      // Try server-side batch processing first
      const processedUrls =
        await getVideoThumbnailWebpUrlsBatchServer(uncachedUrls);

      for (let i = 0; i < uncachedVideos.length; i++) {
        const video = uncachedVideos[i];
        const processedUrl = processedUrls[i];

        // Cache the result
        if (video.thumbnail_url) {
          processedThumbnailCache.set(video.thumbnail_url, processedUrl);
        }

        results.push({ ...video, processedThumbnailUrl: processedUrl });
      }
    } catch (serverError) {
      console.error(
        'Server batch processing failed, falling back to client-side:',
        serverError
      );

      // Fallback to client-side batch processing
      try {
        const processedUrls =
          await getVideoThumbnailWebpUrlsBatch(uncachedUrls);

        for (let i = 0; i < uncachedVideos.length; i++) {
          const video = uncachedVideos[i];
          const processedUrl = processedUrls[i];

          // Cache the result
          if (video.thumbnail_url) {
            processedThumbnailCache.set(video.thumbnail_url, processedUrl);
          }

          results.push({ ...video, processedThumbnailUrl: processedUrl });
        }
      } catch (clientError) {
        console.error(
          'Failed to process video thumbnails in batch:',
          clientError
        );

        // Add uncached videos with null processed URLs
        for (const video of uncachedVideos) {
          if (video.thumbnail_url) {
            processedThumbnailCache.set(video.thumbnail_url, null);
          }
          results.push({ ...video, processedThumbnailUrl: null });
        }
      }
    }
  }

  // Sort results to match original order
  const originalOrder = videos.map((v) => v.id);
  results.sort(
    (a, b) => originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id)
  );

  return results;
}

/**
 * Get the best available thumbnail URL for a video (processed WebP or fallback to original)
 */
export function getVideoThumbnailUrl(
  video: VideoWithProcessedThumbnail
): string {
  return video.processedThumbnailUrl || video.thumbnail_url || '';
}

/**
 * Clear the thumbnail cache (useful for memory management)
 */
export function clearThumbnailCache(): void {
  processedThumbnailCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getThumbnailCacheStats() {
  return {
    size: processedThumbnailCache.size,
    entries: Array.from(processedThumbnailCache.keys()).slice(0, 10), // First 10 for debugging
  };
}

/**
 * Server-side processing for a single video thumbnail
 */
async function getVideoThumbnailWebpUrlServer(
  thumbnailUrl: string
): Promise<string | null> {
  if (!browser) return null; // Only works in browser context

  try {
    const response = await fetch(
      `/api/video-thumbnail?url=${encodeURIComponent(thumbnailUrl)}`
    );

    if (!response.ok) {
      console.error(
        'Server-side thumbnail processing failed:',
        response.status
      );
      return null;
    }

    const data = await response.json();
    return data.webpUrl || null;
  } catch (error) {
    console.error('Server-side thumbnail processing error:', error);
    return null;
  }
}

/**
 * Server-side batch processing for multiple video thumbnails
 */
async function getVideoThumbnailWebpUrlsBatchServer(
  thumbnailUrls: Array<string | null>
): Promise<Array<string | null>> {
  if (!browser) return thumbnailUrls.map(() => null); // Only works in browser context

  try {
    const response = await fetch('/api/video-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ thumbnailUrls }),
    });

    if (!response.ok) {
      console.error(
        'Server-side batch thumbnail processing failed:',
        response.status
      );
      return thumbnailUrls.map(() => null);
    }

    const data = await response.json();
    return data.webpUrls || thumbnailUrls.map(() => null);
  } catch (error) {
    console.error('Server-side batch thumbnail processing error:', error);
    return thumbnailUrls.map(() => null);
  }
}
