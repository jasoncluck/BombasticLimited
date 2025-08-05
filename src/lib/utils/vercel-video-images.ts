/**
 * Vercel Image Optimization utility for video thumbnails
 * Leverages Vercel's Image API for optimization and edge caching
 */

import type { Video } from '$lib/supabase/videos';

/**
 * Configuration for Vercel Image optimization
 */
export interface VercelImageConfig {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
}

/**
 * Default configuration for video thumbnails
 */
export const DEFAULT_VIDEO_THUMBNAIL_CONFIG: VercelImageConfig = {
  width: 480,
  height: 360,
  quality: 90,
  format: 'auto', // Let Vercel choose best format (WebP/AVIF) based on browser support
};

/**
 * High-resolution configuration for video thumbnails
 */
export const DEFAULT_MAXRES_THUMBNAIL_CONFIG: VercelImageConfig = {
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
 * Check if a URL is a YouTube thumbnail that can be optimized with Vercel
 */
export function isOptimizableVideoThumbnail(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const allowedHosts = [
      'i.ytimg.com',
      'img.youtube.com',
      'i1.ytimg.com',
      'i2.ytimg.com',
      'i3.ytimg.com',
      'i4.ytimg.com',
    ];
    return allowedHosts.includes(urlObj.hostname);
  } catch {
    return false;
  }
}

/**
 * Generate Vercel Image API URL for video thumbnail optimization
 */
export function getVercelOptimizedVideoThumbnailUrl(
  thumbnailUrl: string,
  config: VercelImageConfig = DEFAULT_VIDEO_THUMBNAIL_CONFIG
): string {
  const params = new URLSearchParams();

  // Add the source URL
  params.set('url', thumbnailUrl);

  // Add optimization parameters
  if (config.width) {
    params.set('w', config.width.toString());
  }
  if (config.height) {
    params.set('h', config.height.toString());
  }
  if (config.quality) {
    params.set('q', config.quality.toString());
  }
  if (config.format && config.format !== 'auto') {
    params.set('f', config.format);
  }

  return `/_vercel/image?${params.toString()}`;
}

/**
 * Get optimized video thumbnail URL with standard resolution
 * Always uses standard resolution configuration for optimal performance
 */
export function getOptimizedVideoThumbnailUrl(
  video: Video,
  customConfig?: VercelImageConfig
): string | null {
  const thumbnailUrl = getBestThumbnailUrl(video);

  if (!thumbnailUrl) {
    return null;
  }

  // Only use Vercel optimization for supported domains
  if (!isOptimizableVideoThumbnail(thumbnailUrl)) {
    // For non-YouTube thumbnails, fall back to server-side processing
    return `/api/video-thumbnail?type=image&url=${encodeURIComponent(thumbnailUrl)}`;
  }

  // Always use standard config for optimal performance and cost efficiency
  const config = customConfig || DEFAULT_VIDEO_THUMBNAIL_CONFIG;

  return getVercelOptimizedVideoThumbnailUrl(thumbnailUrl, config);
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

  if (!isOptimizableVideoThumbnail(thumbnailUrl)) {
    // For non-YouTube thumbnails, use server-side processing
    const serverUrl = `/api/video-thumbnail?type=image&url=${encodeURIComponent(thumbnailUrl)}`;
    return {
      default: serverUrl,
      small: serverUrl,
      medium: serverUrl,
      large: serverUrl,
    };
  }

  return {
    default: getVercelOptimizedVideoThumbnailUrl(
      thumbnailUrl,
      DEFAULT_VIDEO_THUMBNAIL_CONFIG
    ),
    small: getVercelOptimizedVideoThumbnailUrl(thumbnailUrl, {
      width: 320,
      height: 180,
      quality: 85,
      format: 'auto',
    }),
    medium: getVercelOptimizedVideoThumbnailUrl(thumbnailUrl, {
      width: 640,
      height: 360,
      quality: 90,
      format: 'auto',
    }),
    large: getVercelOptimizedVideoThumbnailUrl(thumbnailUrl, {
      width: 1280,
      height: 720,
      quality: 90,
      format: 'auto',
    }),
  };
}

/**
 * Type guard to check if a URL is a Vercel-optimized image URL
 */
export function isVercelOptimizedUrl(url: string): boolean {
  return url.startsWith('/_vercel/image?');
}

/**
 * Extract original URL from Vercel-optimized URL
 */
export function extractOriginalUrlFromVercel(vercelUrl: string): string | null {
  try {
    const urlObj = new URL(vercelUrl, 'http://localhost');
    return urlObj.searchParams.get('url');
  } catch {
    return null;
  }
}

/**
 * Get cache key for video thumbnail (useful for client-side caching)
 */
export function getVideoThumbnailCacheKey(
  video: Video,
  config?: VercelImageConfig
): string {
  const thumbnailUrl = getBestThumbnailUrl(video);
  const configKey = config ? JSON.stringify(config) : 'default';
  return `video-thumb:${video.id}:${thumbnailUrl}:${configKey}`;
}
