/**
 * Video thumbnail utility that leverages Vercel Image Optimization
 * Uses Vercel's Image API for better performance and edge caching
 * Falls back to server-side Sharp processing for non-YouTube thumbnails
 */

import type { Video } from '$lib/supabase/videos';
import { 
  getOptimizedVideoThumbnailUrl,
  getBestThumbnailUrl,
  isVercelOptimizedUrl,
  extractOriginalUrlFromVercel,
  type VercelImageConfig
} from './vercel-video-images';

/**
 * Get the optimal thumbnail URL for a video
 * Uses Vercel Image Optimization when possible, falls back to server processing
 */
export function getVideoThumbnailUrl(video: Video, config?: VercelImageConfig): string {
  const optimizedUrl = getOptimizedVideoThumbnailUrl(video, config);
  return optimizedUrl || '';
}

/**
 * Get the best available thumbnail URL (maxres preferred)
 * Returns the raw URL without any processing
 */
export function getBestVideoThumbnailUrl(video: Video): string | null {
  return getBestThumbnailUrl(video);
}

/**
 * Get JSON response with WebP data URL (for backwards compatibility)
 * Uses server-side processing for data URL format
 */
export function getVideoThumbnailDataUrl(video: Video): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return '';
  }

  return `/api/video-thumbnail?type=json&url=${encodeURIComponent(thumbnailUrl)}`;
}

/**
 * Get thumbnail URL for batch processing
 * Returns the best available direct URL for batch API calls
 */
export function getDirectThumbnailUrl(video: Video): string | null {
  return getBestThumbnailUrl(video);
}

/**
 * Check if a thumbnail URL is optimized (goes through Vercel or our API)
 */
export function isOptimizedThumbnailUrl(url: string): boolean {
  return isVercelOptimizedUrl(url) || url.startsWith('/api/video-thumbnail?');
}

/**
 * Extract original URL from optimized thumbnail URL
 * Supports both Vercel Image API and server-side API formats
 */
export function extractOriginalUrl(optimizedUrl: string): string | null {
  if (isVercelOptimizedUrl(optimizedUrl)) {
    return extractOriginalUrlFromVercel(optimizedUrl);
  }
  
  // Handle server-side API format
  try {
    const urlObj = new URL(optimizedUrl, 'http://localhost');
    return urlObj.searchParams.get('url');
  } catch {
    return null;
  }
}

/**
 * Check if video has high-resolution thumbnail available
 */
export function hasMaxResThumbnail(video: Video): boolean {
  return !!video.thumbnail_maxres_url;
}

/**
 * Get thumbnail URL with specific dimensions
 */
export function getVideoThumbnailUrlWithSize(
  video: Video, 
  width: number, 
  height: number,
  quality = 90
): string {
  return getVideoThumbnailUrl(video, { width, height, quality, format: 'auto' });
}
