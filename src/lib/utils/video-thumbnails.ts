/**
 * Video thumbnail utility that can use either Vercel Image Optimization or server-side processing
 * Control the approach with the USE_VERCEL_IMAGES environment variable or feature flag
 */

import type { Video } from '$lib/supabase/videos';
import {
  getOptimizedVideoThumbnailUrl,
  getBestThumbnailUrl,
  isVercelOptimizedUrl,
  extractOriginalUrlFromVercel,
  type VercelImageConfig,
} from './vercel-video-images';

/**
 * Feature flag to control image processing approach
 * Can be controlled via environment variable VITE_USE_VERCEL_IMAGES
 * Set to false to use server-side processing for all thumbnails
 * Set to true to use Vercel Image Optimization for YouTube thumbnails
 */
export const USE_VERCEL_IMAGES =
  import.meta.env.VITE_USE_VERCEL_IMAGES !== 'false';

/**
 * Get the optimal thumbnail URL for a video
 * Uses Vercel Image Optimization when enabled, otherwise uses server processing for all
 */
export function getVideoThumbnailUrl(
  video: Video,
  config?: VercelImageConfig
): string {
  // If Vercel images are disabled, always use server processing
  if (!USE_VERCEL_IMAGES) {
    const thumbnailUrl = getBestThumbnailUrl(video);
    if (!thumbnailUrl) return '';
    return `/api/video-thumbnail?type=image&url=${encodeURIComponent(thumbnailUrl)}`;
  }

  // Otherwise use the Vercel-optimized approach
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
  return getVideoThumbnailUrl(video, {
    width,
    height,
    quality,
    format: 'auto',
  });
}
