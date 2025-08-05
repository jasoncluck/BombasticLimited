/**
 * Video thumbnail utility that eliminates all direct JPG requests
 * Uses Vercel-optimized API endpoint for WebP conversion and caching
 */

import type { Video } from '$lib/supabase/videos';

/**
 * Get the optimal thumbnail URL for a video
 * This ensures zero direct JPG requests by using our WebP processing API
 */
export function getVideoThumbnailUrl(video: Video): string {
  // If no thumbnail URL, return empty string
  if (!video.thumbnail_url) {
    return '';
  }

  // Use our API endpoint to serve WebP images directly
  // This eliminates all JPG requests and leverages Vercel's edge caching
  return `/api/video-thumbnail?type=image&url=${encodeURIComponent(video.thumbnail_url)}`;
}

/**
 * Get JSON response with WebP data URL (for backwards compatibility)
 */
export function getVideoThumbnailDataUrl(video: Video): string {
  if (!video.thumbnail_url) {
    return '';
  }

  return `/api/video-thumbnail?type=json&url=${encodeURIComponent(video.thumbnail_url)}`;
}

/**
 * Get thumbnail URL for batch processing
 * Returns the direct URL for batch API calls
 */
export function getDirectThumbnailUrl(video: Video): string | null {
  return video.thumbnail_url;
}

/**
 * Check if a thumbnail URL is optimized (goes through our API)
 */
export function isOptimizedThumbnailUrl(url: string): boolean {
  return url.startsWith('/api/video-thumbnail?');
}

/**
 * Extract original URL from optimized thumbnail URL
 */
export function extractOriginalUrl(optimizedUrl: string): string | null {
  try {
    const urlObj = new URL(optimizedUrl, 'http://localhost');
    return urlObj.searchParams.get('url');
  } catch {
    return null;
  }
}