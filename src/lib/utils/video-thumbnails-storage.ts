import { createClient } from '@supabase/supabase-js';
import { detectOptimalFormat } from '$lib/server/image-processing';

// Initialize Supabase client
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const STORAGE_BUCKET = 'optimized-images';

export interface VideoThumbnailPaths {
  id?: string;
  thumbnail_webp_path?: string | null;
  thumbnail_avif_path?: string | null;
  thumbnail_maxres_webp_path?: string | null;
  thumbnail_maxres_avif_path?: string | null;
  thumbnail_url?: string | null;
  thumbnail_maxres_url?: string | null;
  image_processing_status?: string | null;
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
  paths: VideoThumbnailPaths,
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail',
  acceptHeader?: string | null
): OptimizedImageResult {
  // Detect optimal format based on browser support
  const optimalFormat = detectOptimalFormat(acceptHeader);
  
  // Get storage paths based on image type
  const webpPath = imageType === 'thumbnail' ? paths.thumbnail_webp_path : paths.thumbnail_maxres_webp_path;
  const avifPath = imageType === 'thumbnail' ? paths.thumbnail_avif_path : paths.thumbnail_maxres_avif_path;
  const originalUrl = imageType === 'thumbnail' ? paths.thumbnail_url : paths.thumbnail_maxres_url;
  
  // Try to get optimized image from storage
  if (optimalFormat === 'avif' && avifPath) {
    const url = getStorageUrl(avifPath);
    if (url) {
      return { url, format: 'avif', source: 'storage' };
    }
  }
  
  if ((optimalFormat === 'webp' || optimalFormat === 'avif') && webpPath) {
    const url = getStorageUrl(webpPath);
    if (url) {
      return { url, format: 'webp', source: 'storage' };
    }
  }
  
  // Fallback to original image
  return {
    url: originalUrl || null,
    format: 'jpeg',
    source: 'original'
  };
}

/**
 * Get public URL for a file in Supabase Storage
 */
function getStorageUrl(path: string): string | null {
  if (!path) return null;
  
  try {
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);
    
    return data.publicUrl;
  } catch (error) {
    console.warn('Failed to get storage URL for path:', path, error);
    return null;
  }
}

/**
 * Check if optimized images are available for an entity
 */
export function hasOptimizedImages(paths: VideoThumbnailPaths, imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail'): boolean {
  const webpPath = imageType === 'thumbnail' ? paths.thumbnail_webp_path : paths.thumbnail_maxres_webp_path;
  const avifPath = imageType === 'thumbnail' ? paths.thumbnail_avif_path : paths.thumbnail_maxres_avif_path;
  
  return !!(webpPath || avifPath);
}

/**
 * Get multiple optimized image URLs for videos
 */
export function getOptimizedVideoThumbnails(
  videos: VideoThumbnailPaths[],
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail',
  acceptHeader?: string | null
): OptimizedImageResult[] {
  return videos.map(video => getOptimizedImageUrl(video, imageType, acceptHeader));
}

/**
 * Generate picture element sources for responsive images with format fallbacks
 */
export function generatePictureSources(
  paths: VideoThumbnailPaths,
  imageType: 'thumbnail' | 'thumbnail_maxres' = 'thumbnail'
): Array<{ srcset: string; type: string }> {
  const sources: Array<{ srcset: string; type: string }> = [];
  
  // Get storage paths
  const webpPath = imageType === 'thumbnail' ? paths.thumbnail_webp_path : paths.thumbnail_maxres_webp_path;
  const avifPath = imageType === 'thumbnail' ? paths.thumbnail_avif_path : paths.thumbnail_maxres_avif_path;
  
  // Add AVIF source (highest priority)
  if (avifPath) {
    const avifUrl = getStorageUrl(avifPath);
    if (avifUrl) {
      sources.push({ srcset: avifUrl, type: 'image/avif' });
    }
  }
  
  // Add WebP source (fallback)
  if (webpPath) {
    const webpUrl = getStorageUrl(webpPath);
    if (webpUrl) {
      sources.push({ srcset: webpUrl, type: 'image/webp' });
    }
  }
  
  return sources;
}

/**
 * Queue image processing for a video
 */
export async function queueVideoImageProcessing(
  videoId: string,
  thumbnailUrl: string | null,
  thumbnailMaxresUrl: string | null,
  priority: number = 100
): Promise<void> {
  const jobs = [];
  
  if (thumbnailUrl) {
    jobs.push({
      entityType: 'video' as const,
      entityId: videoId,
      imageType: 'thumbnail' as const,
      sourceUrl: thumbnailUrl,
      priority,
    });
  }
  
  if (thumbnailMaxresUrl) {
    jobs.push({
      entityType: 'video' as const,
      entityId: videoId,
      imageType: 'thumbnail_maxres' as const,
      sourceUrl: thumbnailMaxresUrl,
      priority,
    });
  }
  
  if (jobs.length > 0) {
    // Send batch processing event to Inngest
    const { inngest } = await import('$lib/inngest/client');
    await inngest.send({
      name: 'image.batch.process',
      data: { jobs },
    });
  }
}

/**
 * Queue image processing for a playlist
 */
export async function queuePlaylistImageProcessing(
  playlistId: string,
  thumbnailUrl: string | null,
  thumbnailMaxresUrl: string | null,
  priority: number = 100
): Promise<void> {
  const jobs = [];
  
  if (thumbnailUrl) {
    jobs.push({
      entityType: 'playlist' as const,
      entityId: playlistId,
      imageType: 'thumbnail' as const,
      sourceUrl: thumbnailUrl,
      priority,
    });
  }
  
  if (thumbnailMaxresUrl) {
    jobs.push({
      entityType: 'playlist' as const,
      entityId: playlistId,
      imageType: 'thumbnail_maxres' as const,
      sourceUrl: thumbnailMaxresUrl,
      priority,
    });
  }
  
  if (jobs.length > 0) {
    // Send batch processing event to Inngest
    const { inngest } = await import('$lib/inngest/client');
    await inngest.send({
      name: 'image.batch.process',
      data: { jobs },
    });
  }
}

/**
 * Get processing status for an entity
 */
export async function getImageProcessingStatus(
  entityType: 'video' | 'playlist',
  entityId: string
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