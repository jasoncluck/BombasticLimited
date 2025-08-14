/**
 * Enhanced video thumbnail utility using server-side processing only
 * Provides smart format detection, progressive loading, and optimized caching
 */

import type { Video } from '$lib/supabase/videos';

/**
 * Configuration for image processing
 */
export interface ImageConfig {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'auto';
  progressive?: boolean;
}

/**
 * Default configuration for video thumbnails
 */
export const DEFAULT_VIDEO_THUMBNAIL_CONFIG: ImageConfig = {
  width: 480,
  height: 360,
  quality: 90,
  format: 'auto', // Auto-detect best format based on browser support
};

/**
 * High-resolution configuration for video thumbnails
 */
export const DEFAULT_MAXRES_THUMBNAIL_CONFIG: ImageConfig = {
  width: 1280,
  height: 720,
  quality: 90,
  format: 'auto',
};

/**
 * Get the best available thumbnail URL for a video
 * Prefers thumbnail_url for better performance, falls back to thumbnail_maxres_url
 */
export function getBestThumbnailUrl(video: Video): string | null {
  if (video.thumbnail_url && video.thumbnail_url.trim() !== '') {
    return video.thumbnail_url;
  }
  if (video.thumbnail_maxres_url) {
    return video.thumbnail_maxres_url;
  }
  return null;
}

/**
 * Get video thumbnail URL - returns original URL to avoid server-side processing
 * The background processing system handles optimization separately
 */
export function getVideoThumbnailUrl(
  video: Video,
  config?: ImageConfig
): string {
  const thumbnailUrl = getBestThumbnailUrl(video);

  if (!thumbnailUrl) {
    return '';
  }

  // Return original URL directly - no server-side processing
  // Components will use optimized storage system when available
  return thumbnailUrl;
}

/**
 * Get the best available thumbnail URL (maxres preferred)
 * Returns the raw URL without any processing
 */
export function getBestVideoThumbnailUrl(video: Video): string | null {
  return getBestThumbnailUrl(video);
}

/**
 * Get JSON response with processed data URL - DEPRECATED
 * Returns original URL to avoid server-side processing
 */
export function getVideoThumbnailDataUrl(
  video: Video,
  config?: ImageConfig
): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return '';
  }

  // Return original URL directly - no server-side processing
  return thumbnailUrl;
}

/**
 * Get progressive images for responsive loading - DEPRECATED
 * Returns original URL to avoid server-side processing
 */
export function getVideoThumbnailProgressiveUrl(video: Video): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return '';
  }

  // Return original URL directly - no server-side processing
  return thumbnailUrl;
}

/**
 * Get thumbnail URL for batch processing
 * Returns the best available direct URL for batch API calls
 */
export function getDirectThumbnailUrl(video: Video): string | null {
  return getBestThumbnailUrl(video);
}

/**
 * Check if a thumbnail URL is optimized (goes through our API)
 */
export function isOptimizedThumbnailUrl(url: string): boolean {
  return url.startsWith('/api/video-thumbnail?');
}

/**
 * Extract original URL from optimized thumbnail URL
 * Supports server-side API format
 */
export function extractOriginalUrl(optimizedUrl: string): string | null {
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

/**
 * Get multiple thumbnail sizes for responsive images - returns original URLs
 */
export function getResponsiveVideoThumbnailUrls(video: Video): {
  default: string | null;
  small: string | null;
  medium: string | null;
  large: string | null;
} {
  const thumbnailUrl = getBestThumbnailUrl(video);

  if (!thumbnailUrl) {
    return {
      default: null,
      small: null,
      medium: null,
      large: null,
    };
  }

  // Return original URL for all sizes - no server-side processing
  // Background processing system handles optimization separately
  return {
    default: thumbnailUrl,
    small: thumbnailUrl,
    medium: thumbnailUrl,
    large: thumbnailUrl,
  };
}

/**
 * Get cache key for video thumbnail (useful for client-side caching)
 */
export function getVideoThumbnailCacheKey(
  video: Video,
  config?: ImageConfig
): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  const configKey = config ? JSON.stringify(config) : 'default';
  return `video-thumb:${video.id}:${thumbnailUrl}:${configKey}`;
}

// Helper functions

/**
 * Build server-side thumbnail URL with configuration
 */
function buildServerThumbnailUrl(
  thumbnailUrl: string,
  config?: ImageConfig
): string {
  const params = new URLSearchParams();
  params.set('url', thumbnailUrl);
  params.set('type', 'image');

  if (config) {
    addConfigParams(params, config);
  }

  return `/api/video-thumbnail?${params.toString()}`;
}

/**
 * Add configuration parameters to URL search params
 */
function addConfigParams(params: URLSearchParams, config: ImageConfig): void {
  if (config.format && config.format !== 'auto') {
    params.set('format', config.format);
  }
  if (config.quality !== undefined) {
    params.set('quality', config.quality.toString());
  }
  if (config.width !== undefined) {
    params.set('width', config.width.toString());
  }
  if (config.height !== undefined) {
    params.set('height', config.height.toString());
  }
}
