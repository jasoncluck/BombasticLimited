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
 * Get optimized video thumbnail URL using server-side processing
 * Always uses server-side processing for consistent results
 */
export function getVideoThumbnailUrl(
  video: Video,
  config?: ImageConfig
): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  
  if (!thumbnailUrl) {
    return '';
  }

  // Always use server-side processing for all thumbnails
  return buildServerThumbnailUrl(thumbnailUrl, config);
}

/**
 * Get the best available thumbnail URL (maxres preferred)
 * Returns the raw URL without any processing
 */
export function getBestVideoThumbnailUrl(video: Video): string | null {
  return getBestThumbnailUrl(video);
}

/**
 * Get JSON response with processed data URL
 * Uses server-side processing for data URL format
 */
export function getVideoThumbnailDataUrl(video: Video, config?: ImageConfig): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('url', thumbnailUrl);
  params.set('type', 'json');
  
  if (config) {
    addConfigParams(params, config);
  }

  return `/api/video-thumbnail?${params.toString()}`;
}

/**
 * Get progressive images for responsive loading
 */
export function getVideoThumbnailProgressiveUrl(video: Video): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return '';
  }

  return `/api/video-thumbnail?type=progressive&url=${encodeURIComponent(thumbnailUrl)}`;
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
 * Get multiple thumbnail sizes for responsive images
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

  return {
    default: buildServerThumbnailUrl(thumbnailUrl, DEFAULT_VIDEO_THUMBNAIL_CONFIG),
    small: buildServerThumbnailUrl(thumbnailUrl, {
      width: 320,
      height: 180,
      quality: 85,
      format: 'auto',
    }),
    medium: buildServerThumbnailUrl(thumbnailUrl, {
      width: 640,
      height: 360,
      quality: 90,
      format: 'auto',
    }),
    large: buildServerThumbnailUrl(thumbnailUrl, {
      width: 1280,
      height: 720,
      quality: 90,
      format: 'auto',
    }),
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
function buildServerThumbnailUrl(thumbnailUrl: string, config?: ImageConfig): string {
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
