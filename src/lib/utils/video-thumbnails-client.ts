import type { SupabaseClient } from '@supabase/supabase-js';
import { detectOptimalFormat } from './image-format-detection';
import { IMAGES_BUCKET } from '$lib/constants/images';

export interface ThumbnailPaths {
  id?: string | number | bigint;
  thumbnail_webp_url?: string | null;
  thumbnail_avif_url?: string | null;
  thumbnail_maxres_webp_url?: string | null;
  thumbnail_maxres_avif_url?: string | null;
  thumbnail_url?: string | null;
  thumbnail_maxres_url?: string | null;
  image_processing_status?: string | null;
  // For playlists - uploaded images
  image_url?: string | null;
  image_webp_url?: string | null;
  image_avif_url?: string | null;
}

export interface OptimizedImageResult {
  url: string | null;
  format: 'avif' | 'webp' | 'jpeg';
  source: 'storage' | 'original';
}

/**
 * Get optimized image URL with smart fallback chain
 * Priority: AVIF (if supported) -> WebP (if supported) -> Original JPEG
 */
export function getOptimizedImageUrl(
  paths: ThumbnailPaths,
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail',
  supabase: SupabaseClient<any>,
  acceptHeader?: string | null
): OptimizedImageResult {
  // Detect optimal format based on browser support
  const optimalFormat = detectOptimalFormat(acceptHeader);

  // Get storage paths based on image type
  const webpPath =
    imageType === 'thumbnail'
      ? paths.thumbnail_webp_url
      : paths.thumbnail_maxres_webp_url;
  const avifPath =
    imageType === 'thumbnail'
      ? paths.thumbnail_avif_url
      : paths.thumbnail_maxres_avif_url;
  const originalUrl =
    imageType === 'thumbnail'
      ? paths.thumbnail_url
      : paths.thumbnail_maxres_url;

  // Try to get optimized image from storage
  if (optimalFormat === 'avif' && avifPath) {
    const url = getStorageUrl(avifPath, supabase);
    if (url) {
      return { url, format: 'avif', source: 'storage' };
    }
  }

  if ((optimalFormat === 'webp' || optimalFormat === 'avif') && webpPath) {
    const url = getStorageUrl(webpPath, supabase);
    if (url) {
      return { url, format: 'webp', source: 'storage' };
    }
  }

  // Fallback to original image
  return {
    url: originalUrl || null,
    format: 'jpeg',
    source: 'original',
  };
}

/**
 * Get optimized playlist image URL with smart fallback chain
 * Priority: AVIF (uploaded) -> WebP (uploaded) -> Original uploaded JPEG -> YouTube thumbnail fallback
 */
export function getOptimizedPlaylistImageUrl(
  paths: ThumbnailPaths,
  supabase: SupabaseClient<any>,
  acceptHeader?: string | null
): OptimizedImageResult {
  // Detect optimal format based on browser support
  const optimalFormat = detectOptimalFormat(acceptHeader);

  // Try uploaded image optimized versions first
  if (optimalFormat === 'avif' && paths.image_avif_url) {
    const url = getStorageUrl(paths.image_avif_url, supabase);
    if (url) {
      return { url, format: 'avif', source: 'storage' };
    }
  }

  if (
    (optimalFormat === 'webp' || optimalFormat === 'avif') &&
    paths.image_webp_url
  ) {
    const url = getStorageUrl(paths.image_webp_url, supabase);
    if (url) {
      return { url, format: 'webp', source: 'storage' };
    }
  }

  // Try original uploaded image
  if (paths.image_url) {
    const url = getStorageUrl(paths.image_url, supabase);
    if (url) {
      return { url, format: 'jpeg', source: 'storage' };
    }
  }

  // Fallback to YouTube thumbnail chain (for playlists without uploaded images)
  return getOptimizedImageUrl(
    paths,
    'thumbnail_maxres',
    supabase,
    acceptHeader
  );
}

/**
 * Get public URL for a file in Supabase Storage
 */
function getStorageUrl(
  path: string,
  supabase: SupabaseClient<any>
): string | null {
  if (!path) return null;

  try {
    const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);

    return data.publicUrl;
  } catch (error) {
    console.warn('Failed to get storage URL for path:', path, error);
    return null;
  }
}

/**
 * Check if optimized images are available for an entity
 */
export function hasOptimizedImages(
  paths: ThumbnailPaths,
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail'
): boolean {
  const webpPath =
    imageType === 'thumbnail'
      ? paths.thumbnail_webp_url
      : paths.thumbnail_maxres_webp_url;
  const avifPath =
    imageType === 'thumbnail'
      ? paths.thumbnail_avif_url
      : paths.thumbnail_maxres_avif_url;

  return !!(webpPath || avifPath);
}

/**
 * Check if a playlist has uploaded images (either original or optimized)
 */
export function hasUploadedPlaylistImage(paths: ThumbnailPaths): boolean {
  return !!(paths.image_url || paths.image_webp_url || paths.image_avif_url);
}

/**
 * Get multiple optimized image URLs for videos
 */
export function getOptimizedVideoThumbnails(
  videos: ThumbnailPaths[],
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail',
  supabase: SupabaseClient<any>,
  acceptHeader?: string | null
): OptimizedImageResult[] {
  return videos.map((video) =>
    getOptimizedImageUrl(video, imageType, supabase, acceptHeader)
  );
}

/**
 * Generate picture element sources for responsive images with format fallbacks
 */
export function generatePictureSources(
  paths: ThumbnailPaths,
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail',
  supabase: SupabaseClient<any>
): Array<{ srcset: string; type: string }> {
  const sources: Array<{ srcset: string; type: string }> = [];

  // Get storage paths
  const webpPath =
    imageType === 'thumbnail'
      ? paths.thumbnail_webp_url
      : paths.thumbnail_maxres_webp_url;
  const avifPath =
    imageType === 'thumbnail'
      ? paths.thumbnail_avif_url
      : paths.thumbnail_maxres_avif_url;

  // Add AVIF source (highest priority)
  if (avifPath) {
    const avifUrl = getStorageUrl(avifPath, supabase);
    if (avifUrl) {
      sources.push({ srcset: avifUrl, type: 'image/avif' });
    }
  }

  // Add WebP source (fallback)
  if (webpPath) {
    const webpUrl = getStorageUrl(webpPath, supabase);
    if (webpUrl) {
      sources.push({ srcset: webpUrl, type: 'image/webp' });
    }
  }

  return sources;
}

/**
 * Get processing status for an entity
 */
export async function getImageProcessingStatus(
  entityType: 'video' | 'playlist',
  entityId: string,
  supabase: SupabaseClient<any>
): Promise<'pending' | 'processing' | 'completed' | 'failed' | null> {
  try {
    const tableName = entityType === 'video' ? 'videos' : 'playlists';
    const { data, error } = await supabase
      .from(tableName)
      .select('image_processing_status')
      .eq('id', entityId)
      .single();

    if (error) {
      console.warn('Failed to get processing status:', error);
      return null;
    }

    return data?.image_processing_status || null;
  } catch (error) {
    console.warn('Failed to get processing status:', error);
    return null;
  }
}