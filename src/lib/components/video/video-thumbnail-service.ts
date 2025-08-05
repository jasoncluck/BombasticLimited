import { getVideoThumbnailWebpUrl, getVideoThumbnailWebpUrlsBatch } from '../playlist/playlist-service';
import type { Video } from '$lib/supabase/videos';

// Cache for processed video thumbnails to avoid reprocessing
const processedThumbnailCache = new Map<string, string | null>();

// Type extension for videos with processed thumbnails
export type VideoWithProcessedThumbnail = Video & {
  processedThumbnailUrl?: string | null;
};

/**
 * Process a single video thumbnail to WebP format
 */
export async function processVideoThumbnail(video: Video): Promise<VideoWithProcessedThumbnail> {
  if (!video.thumbnail_url) {
    return { ...video, processedThumbnailUrl: null };
  }

  // Check cache first
  const cached = processedThumbnailCache.get(video.thumbnail_url);
  if (cached !== undefined) {
    return { ...video, processedThumbnailUrl: cached };
  }

  try {
    const processedUrl = await getVideoThumbnailWebpUrl({
      thumbnailUrl: video.thumbnail_url,
    });

    // Cache the result
    processedThumbnailCache.set(video.thumbnail_url, processedUrl);

    return { ...video, processedThumbnailUrl: processedUrl };
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
export async function processVideoThumbnails(videos: Video[]): Promise<VideoWithProcessedThumbnail[]> {
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
      const processedUrls = await getVideoThumbnailWebpUrlsBatch(uncachedUrls);
      
      for (let i = 0; i < uncachedVideos.length; i++) {
        const video = uncachedVideos[i];
        const processedUrl = processedUrls[i];
        
        // Cache the result
        if (video.thumbnail_url) {
          processedThumbnailCache.set(video.thumbnail_url, processedUrl);
        }
        
        results.push({ ...video, processedThumbnailUrl: processedUrl });
      }
    } catch (error) {
      console.error('Failed to process video thumbnails in batch:', error);
      
      // Add uncached videos with null processed URLs
      for (const video of uncachedVideos) {
        if (video.thumbnail_url) {
          processedThumbnailCache.set(video.thumbnail_url, null);
        }
        results.push({ ...video, processedThumbnailUrl: null });
      }
    }
  }

  // Sort results to match original order
  const originalOrder = videos.map(v => v.id);
  results.sort((a, b) => originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id));

  return results;
}

/**
 * Get the best available thumbnail URL for a video (processed WebP or fallback to original)
 */
export function getVideoThumbnailUrl(video: VideoWithProcessedThumbnail): string {
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