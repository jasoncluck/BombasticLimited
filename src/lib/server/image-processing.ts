import {
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
  PLAYLIST_IMAGE_CROP_DEFAULTS,
} from '$lib/components/playlist/playlist-service';
import sharp from 'sharp';
import { ImageCacheManager } from './image-cache';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

// Initialize image cache manager
const imageCacheManager = ImageCacheManager.getInstance();

// **SPEED-OPTIMIZED** image processing configuration
export interface ImageProcessingOptions {
  format?: 'auto' | 'webp' | 'jpeg' | 'avif';
  quality?: number;
  width?: number;
  height?: number;
  progressive?: boolean;
  lossless?: boolean;
}

// Domain validation for security
const ALLOWED_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'static-cdn.jtvnw.net',
  PUBLIC_SUPABASE_URL,
];

// Validate URL domain for security
export function validateImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_DOMAINS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

// Memory usage monitoring
export function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024),
  };
}

// **SPEED: Lower quality for fast server processing**
export function calculateOptimalQuality(
  metadata: Partial<sharp.Metadata>,
  targetFormat: string,
  baseQuality = 75 // **SPEED: Reduced from 90 to 75**
): number {
  const imageSize = (metadata.width || 0) * (metadata.height || 0);

  // **SPEED: Lower quality adjustments for faster processing**
  let formatQuality = baseQuality;
  if (targetFormat === 'avif') {
    formatQuality = Math.max(baseQuality - 10, 65); // **SPEED: More aggressive reduction**
  } else if (targetFormat === 'webp') {
    formatQuality = Math.max(baseQuality - 5, 70);
  }

  // **SPEED: Less quality variation based on size**
  if (imageSize > 1920 * 1080) {
    return Math.max(formatQuality - 5, 65); // **SPEED: Reduced quality for large images**
  } else if (imageSize < 640 * 360) {
    return Math.min(formatQuality + 5, 85); // **SPEED: Cap at 85 instead of 95**
  }

  return formatQuality;
}

// **SPEED-OPTIMIZED** unified image processing function
export async function processImageServer({
  imageUrl,
  imageProperties = null,
  acceptHeader = null,
  options = {},
  isCropped = false,
  isMaxRes = false,
  contentType = 'video', // **NEW: Add content type**
}: {
  imageUrl: string | null;
  imageProperties?: PlaylistImageProperties | null;
  acceptHeader?: string | null;
  options?: ImageProcessingOptions;
  isCropped?: boolean;
  isMaxRes?: boolean;
  contentType?: 'playlist' | 'video'; // **NEW: Content type parameter**
}) {
  if (!imageUrl) {
    return null;
  }

  // Determine optimal format based on Accept header or explicit format
  let targetFormat: 'avif' | 'webp' | 'jpeg';
  if (options.format === 'auto' || !options.format) {
    targetFormat = detectOptimalFormat(acceptHeader);
  } else {
    targetFormat = options.format as 'avif' | 'webp' | 'jpeg';
  }

  // **SPEED: Prefer WebP over AVIF for faster processing**
  const formatFallbackChain: ('avif' | 'webp' | 'jpeg')[] = acceptHeader
    ? ['webp', targetFormat === 'avif' ? 'avif' : 'jpeg'] // **SPEED: WebP first**
    : ['webp', 'jpeg']; // **SPEED: Skip AVIF for external sources**

  const isStandardResolution = isCropped && !isMaxRes;

  try {
    // **SPEED: Reduced timeout for faster responses**
    const response = await fetchWithRetry(imageUrl, {
      signal: AbortSignal.timeout(5000), // **SPEED: Reduced from 10s to 5s**
      headers: {
        Accept: 'image/*',
        'User-Agent': isCropped ? 'Playlist-Service/1.0' : 'Video-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    const imageBuffer = await response.arrayBuffer();

    // **BRIGHTNESS FIX: Consistent Sharp initialization**
    const sharpInstance = sharp(imageBuffer, {
      failOnError: false,
      density: 72, // **SPEED: Use standard density for all**
      pages: 1,
    });

    // Get image metadata for optimization
    const metadata = await sharpInstance.metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    let processedInstance = sharpInstance;

    // Apply cropping if needed
    if (isCropped) {
      // Use provided image properties or defaults
      const cropProperties =
        imageProperties ||
        (isMaxRes
          ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
          : PLAYLIST_IMAGE_CROP_DEFAULTS);

      // Validate and adjust crop dimensions
      const validatedCrop = validateAndAdjustCropDimensions(
        cropProperties,
        imageWidth,
        imageHeight,
        isMaxRes ? 'maxres' : 'standard'
      );

      // Extract the crop area
      processedInstance = processedInstance.extract({
        left: validatedCrop.x,
        top: validatedCrop.y,
        width: validatedCrop.width,
        height: validatedCrop.height,
      });

      // **SPEED: Resize to smaller output sizes like browser**
      const previewSize = isMaxRes ? 360 : 180; // **SPEED: Match browser preview sizes**
      processedInstance = processedInstance.resize(previewSize, previewSize, {
        fit: 'cover',
        withoutEnlargement: false,
        kernel: sharp.kernel.nearest, // **SPEED: Fastest resampling**
      });
    }

    // **SPEED: Resize for non-cropped images to smaller sizes**
    if (!isCropped && (options.width || options.height)) {
      const maxSize = Math.min(
        options.width || 320,
        options.height || 320,
        320
      ); // **SPEED: Cap at 320px**
      processedInstance = processedInstance.resize(maxSize, maxSize, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: true,
        kernel: sharp.kernel.nearest, // **SPEED: Fastest resampling**
      });
    }

    processedInstance = processedInstance.toColourspace('srgb'); // **FIX: Force sRGB color space (British spelling)**

    // **SPEED: Lower quality calculation**
    const quality =
      options.quality ||
      calculateOptimalQuality(
        metadata,
        targetFormat,
        isStandardResolution ? 75 : 70 // **SPEED & BRIGHTNESS: Match browser quality**
      );

    console.log(
      `🖼️ Processing ${contentType} image: ${targetFormat}, quality: ${quality}, size: ${imageWidth}x${imageHeight}`
    );

    let processedImageBuffer: Buffer | undefined;
    let mimeType: string = 'image/jpeg';

    for (const format of formatFallbackChain) {
      try {
        switch (format) {
          case 'avif':
            processedImageBuffer = await processedInstance
              .avif({
                quality: Math.min(quality, 75), // **SPEED: Lower max quality**
                effort: 2, // **SPEED: Reduced effort from 4 to 2**
                lossless: false,
              })
              .toBuffer();
            mimeType = 'image/avif';
            break;

          case 'webp':
            processedImageBuffer = await processedInstance
              .webp({
                quality,
                effort: 1,
                lossless: false,
                nearLossless: false,
                smartSubsample: true,
                preset: 'photo',
              })
              .toBuffer();
            mimeType = 'image/webp';
            break;

          case 'jpeg':
            processedImageBuffer = await processedInstance
              .jpeg({
                quality,
                progressive: false, // **SPEED: Disable progressive for speed**
                mozjpeg: false, // **SPEED: Use standard JPEG encoder**
              })
              .toBuffer();
            mimeType = 'image/jpeg';
            break;
        }

        // If we get here, the format worked - break out of the fallback loop
        break;
      } catch (formatError) {
        console.warn(
          `Failed to process image with ${format} format, trying next fallback:`,
          formatError
        );

        // If this was the last format in the chain, re-throw the error
        if (format === formatFallbackChain[formatFallbackChain.length - 1]) {
          throw formatError;
        }
      }
    }

    if (!processedImageBuffer) {
      throw new Error('Failed to process image with any available format');
    }

    // Convert to base64 data URL
    const base64 = processedImageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return dataUrl;
  } catch (error) {
    console.error(
      `Fast server image processing failed for ${imageUrl}:`,
      error
    );
    return null;
  }
}

export async function getCroppedPlaylistImageUrlServer({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
  options = {},
  acceptHeader = null,
}: {
  imageProperties: PlaylistImageProperties | null;
  thumbnailMaxResUrl?: string;
  thumbnailUrl?: string;
  options?: ImageProcessingOptions;
  acceptHeader?: string | null;
}) {
  const imageUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!imageUrl) return null;

  const isMaxRes = !!thumbnailMaxResUrl;

  return processImageServer({
    imageUrl,
    imageProperties,
    acceptHeader,
    options,
    isCropped: true,
    isMaxRes,
    contentType: 'playlist', // **FIXED: Specify playlist content type**
  });
}

// **SPEED-OPTIMIZED** video thumbnail processing
export async function getVideoThumbnailWebpUrlServer({
  thumbnailUrl,
  options = {},
  acceptHeader = null,
}: {
  thumbnailUrl: string | null;
  options?: ImageProcessingOptions;
  acceptHeader?: string | null;
}) {
  if (!thumbnailUrl) return null;

  // **SPEED: Force smaller dimensions for video thumbnails**
  const fastOptions = {
    ...options,
    width: Math.min(options.width || 320, 320),
    height: Math.min(options.height || 320, 320),
  };

  return processImageServer({
    imageUrl: thumbnailUrl,
    acceptHeader,
    options: fastOptions,
    isCropped: false,
    contentType: 'video', // **FIXED: Specify video content type**
  });
}

// **SPEED: Simplified progressive image generation**
export async function generateProgressiveImages(
  thumbnailUrl: string,
  sizes: Array<{ width: number; height: number; quality?: number }>,
  acceptHeader: string | null = null
): Promise<Array<{ size: string; dataUrl: string | null }>> {
  const results: Array<{ size: string; dataUrl: string | null }> = [];

  // **SPEED: Process only essential sizes**
  const limitedSizes = sizes.slice(0, 3); // **SPEED: Limit to first 3 sizes**

  for (const size of limitedSizes) {
    try {
      const dataUrl = await getVideoThumbnailWebpUrlServer({
        thumbnailUrl,
        options: {
          width: Math.min(size.width, 320), // **SPEED: Cap width**
          height: Math.min(size.height, 320), // **SPEED: Cap height**
          quality: Math.min(size.quality || 75, 75), // **SPEED: Lower quality**
          format: 'webp', // **SPEED: Force WebP for speed**
        },
        acceptHeader,
      });

      results.push({
        size: `${size.width}x${size.height}`,
        dataUrl,
      });
    } catch (error) {
      console.error(
        `Failed to generate ${size.width}x${size.height} image:`,
        error
      );
      results.push({
        size: `${size.width}x${size.height}`,
        dataUrl: null,
      });
    }
  }

  return results;
}

// **SPEED: Faster fetch with shorter timeouts**
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2, // **SPEED: Reduced retries**
  delay = 500 // **SPEED: Shorter delay**
): Promise<Response> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }

      throw new Error(`Server error: ${response.status}`);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors or last attempt
      if (
        attempt === maxRetries ||
        (error as Error).message.includes('Client error')
      ) {
        break;
      }

      // **SPEED: Shorter exponential backoff**
      await new Promise(
        (resolve) => setTimeout(resolve, delay * Math.pow(1.5, attempt - 1)) // **SPEED: Reduced multiplier**
      );
    }
  }

  throw lastError;
}

/**
 * **SPEED-OPTIMIZED** validation function
 */
function validateAndAdjustCropDimensions(
  imageProperties: PlaylistImageProperties,
  imageWidth: number,
  imageHeight: number,
  imageType: 'maxres' | 'standard'
): PlaylistImageProperties {
  if (imageWidth > 0 && imageHeight > 0) {
    let scaledProperties = { ...imageProperties };

    if (imageType === 'standard') {
      // Handle known YouTube thumbnail sizes - **SPEED: Same logic as browser**
      const isYouTubeMedium = imageWidth === 320 && imageHeight === 180;
      const isYouTubeDefault = imageWidth === 120 && imageHeight === 90;
      const isYouTubeHigh = imageWidth === 480 && imageHeight === 360;

      if (isYouTubeMedium) {
        scaledProperties = {
          x: Math.round((320 - 180) / 2), // 70px from left
          y: 0,
          width: 180,
          height: 180,
        };
      } else if (isYouTubeDefault) {
        scaledProperties = {
          x: Math.round((120 - 90) / 2), // 15px from left
          y: 0,
          width: 90,
          height: 90,
        };
      } else if (isYouTubeHigh) {
        scaledProperties = {
          x: Math.round((480 - 360) / 2), // 60px from left
          y: 0,
          width: 360,
          height: 360,
        };
      } else {
        // **SPEED: Quick square crop**
        const cropSize = Math.min(imageWidth, imageHeight);
        scaledProperties = {
          x: Math.round((imageWidth - cropSize) / 2),
          y: Math.round((imageHeight - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        };
      }
    } else {
      scaledProperties = { ...imageProperties };
    }

    // **SPEED: Quick bounds validation**
    const adjustedX = Math.max(0, Math.min(scaledProperties.x, imageWidth - 1));
    const adjustedY = Math.max(
      0,
      Math.min(scaledProperties.y, imageHeight - 1)
    );

    const maxWidth = imageWidth - adjustedX;
    const maxHeight = imageHeight - adjustedY;
    const adjustedWidth = Math.max(
      1,
      Math.min(scaledProperties.width, maxWidth)
    );
    const adjustedHeight = Math.max(
      1,
      Math.min(scaledProperties.height, maxHeight)
    );

    return {
      x: adjustedX,
      y: adjustedY,
      width: adjustedWidth,
      height: adjustedHeight,
    };
  }

  return {
    x: Math.max(0, imageProperties.x),
    y: Math.max(0, imageProperties.y),
    width: Math.max(1, imageProperties.width),
    height: Math.max(1, imageProperties.height),
  };
}

// Image cache management functions (unchanged)
export async function clearImageCache(
  authState?: 'auth' | 'anon'
): Promise<void> {
  await imageCacheManager.initialize();
  await imageCacheManager.clear(authState);
}

export async function getImageCacheStats(): Promise<{
  memoryEntries: number;
  memorySize: number;
  authEntries: { auth: number; anon: number };
}> {
  await imageCacheManager.initialize();
  return imageCacheManager.getStats();
}

export async function cleanupImageCache(): Promise<void> {
  await imageCacheManager.initialize();
  await imageCacheManager.cleanup();
}

// **SPEED: Direct URL return for fastest response**
export function generatePlaylistImageUrl({
  thumbnailUrl,
  thumbnailMaxResUrl,
}: {
  thumbnailUrl?: string | null;
  thumbnailMaxResUrl?: string | null;
  imageProperties?: PlaylistImageProperties | null;
  format?: 'auto' | 'webp' | 'jpeg' | 'avif';
  quality?: number;
  responseType?: 'image' | 'json';
}): string | null {
  const effectiveUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!effectiveUrl) return null;

  // **SPEED: Return original URL directly for fastest response**
  // Background processing system handles optimization separately
  return effectiveUrl;
}
