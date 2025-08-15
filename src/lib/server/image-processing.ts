import type { ImageProperties } from '$lib/components/playlist/playlist';
import {
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
  PLAYLIST_IMAGE_CROP_DEFAULTS,
} from '$lib/components/playlist/playlist-service';
import sharp from 'sharp';
import {
  ImageCacheManager,
  generateImageCacheKey,
  generatePlaylistImageCacheKey,
  type ImageCacheMetadata,
} from './image-cache';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// Initialize image cache manager
const imageCacheManager = ImageCacheManager.getInstance();

// Helper function to detect auth state from request headers or context
function detectAuthState(request?: Request): 'auth' | 'anon' {
  if (!request) return 'anon';

  try {
    // Check for auth cookies in the request
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const authCookie = cookieHeader
        .split(';')
        .find((cookie) => cookie.trim().startsWith('sb-127-auth-token'));

      if (authCookie) {
        const cookieValue = authCookie.split('=')[1];
        const isAuthenticated = !!(
          cookieValue &&
          cookieValue !== 'null' &&
          cookieValue !== 'undefined' &&
          cookieValue.trim() !== '' &&
          cookieValue !== '%7B%7D' &&
          cookieValue !== '{}'
        );
        return isAuthenticated ? 'auth' : 'anon';
      }
    }
  } catch (error) {
    console.warn('Error detecting auth state:', error);
  }

  return 'anon';
}

// Helper function to extract userId from request (simplified - returns null for now)
// In a real implementation, this would decode the auth token to get the user ID
function extractUserId(request?: Request): string | null {
  // For now, return null since we don't have direct access to user ID from request
  // In a full implementation, you'd decode the JWT token or lookup from session
  return null;
}

// Enhanced image processing configuration
export interface ImageProcessingOptions {
  format?: 'auto' | 'webp' | 'jpeg' | 'avif';
  quality?: number;
  width?: number;
  height?: number;
  progressive?: boolean;
  lossless?: boolean;
}

// Memory management for large batch operations
const MAX_CONCURRENT_PROCESSING = 5;
const PROCESSING_TIMEOUT = 30000; // 30 seconds

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
    rss: Math.round(used.rss / 1024 / 1024), // MB
    heapTotal: Math.round(used.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(used.heapUsed / 1024 / 1024), // MB
    external: Math.round(used.external / 1024 / 1024), // MB
  };
}

// Smart quality adjustment based on image content and size
export function calculateOptimalQuality(
  metadata: Partial<sharp.Metadata>,
  targetFormat: string,
  baseQuality = 90
): number {
  const imageSize = (metadata.width || 0) * (metadata.height || 0);

  // Format-specific quality adjustments
  let formatQuality = baseQuality;
  if (targetFormat === 'avif') {
    // AVIF can achieve similar quality at lower settings
    formatQuality = Math.max(baseQuality - 15, 70);
  } else if (targetFormat === 'webp') {
    // WebP is efficient but not as much as AVIF
    formatQuality = Math.max(baseQuality - 5, 80);
  }

  // Adjust quality based on image size
  if (imageSize > 1920 * 1080) {
    // Large images
    return targetFormat === 'jpeg'
      ? Math.max(formatQuality - 10, 75)
      : Math.max(formatQuality - 5, 70);
  } else if (imageSize < 640 * 360) {
    // Small images
    return Math.min(formatQuality + 5, 95);
  }

  return formatQuality;
}

// Unified image processing function that handles both cropped and non-cropped images
export async function processImageServer({
  imageUrl,
  imageProperties = null,
  acceptHeader = null,
  options = {},
  isCropped = false,
  isMaxRes = false,
}: {
  imageUrl: string | null;
  imageProperties?: ImageProperties | null;
  acceptHeader?: string | null;
  options?: ImageProcessingOptions;
  isCropped?: boolean;
  isMaxRes?: boolean;
}) {
  if (!imageUrl) {
    return null;
  }
  // Validate URL domain for security
  // if (!validateImageUrl(imageUrl)) {
  //   console.warn(`Domain not allowed for URL: ${imageUrl}`);
  //   return null;
  // }
  //
  console.log('image properties');
  console.log(imageProperties);

  // Determine optimal format based on Accept header or explicit format
  let targetFormat: 'avif' | 'webp' | 'jpeg';
  if (options.format === 'auto' || !options.format) {
    targetFormat = detectOptimalFormat(acceptHeader);
  } else {
    targetFormat = options.format as 'avif' | 'webp' | 'jpeg';
  }

  // Enhanced fallback chain for external images (e.g., YouTube)
  // If no Accept header is available, use a conservative approach
  const formatFallbackChain: ('avif' | 'webp' | 'jpeg')[] = acceptHeader
    ? [targetFormat, 'webp', 'jpeg']
    : ['webp', 'jpeg']; // Skip AVIF for external sources without Accept headers

  // Determine if we're using standard resolution (for cropped images)
  const isStandardResolution = isCropped && !isMaxRes;

  try {
    // Fetch image with optimized settings and retry logic
    const response = await fetchWithRetry(imageUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'image/*',
        'User-Agent': isCropped ? 'Playlist-Service/1.0' : 'Video-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    const imageBuffer = await response.arrayBuffer();

    const sharpInstance = sharp(imageBuffer, {
      failOnError: false,
      density: isStandardResolution ? 150 : 72,
      pages: 1, // Handle animated images
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
    }

    // Apply resize if specified (for non-cropped images)
    if (!isCropped && (options.width || options.height)) {
      processedInstance = processedInstance.resize(
        options.width,
        options.height,
        {
          fit: 'cover',
          position: 'center',
          withoutEnlargement: true,
        }
      );
    }

    // Calculate optimal quality
    const quality =
      options.quality ||
      calculateOptimalQuality(
        metadata,
        targetFormat,
        isStandardResolution ? 95 : 90
      );

    console.log(
      `Processing image with format: ${targetFormat}, quality: ${quality}, size: ${imageWidth}x${imageHeight}, acceptHeader: ${acceptHeader ? 'present' : 'missing'}`
    );

    let processedImageBuffer: Buffer | undefined;
    let mimeType: string = 'image/jpeg'; // Default fallback
    let actualFormat = targetFormat;

    // Enhanced format handling with fallback support
    for (const format of formatFallbackChain) {
      try {
        switch (format) {
          case 'avif':
            processedImageBuffer = await processedInstance
              .avif({
                quality: Math.min(quality, 85), // AVIF handles lower quality better
                effort: 4, // Higher effort for better compression
                lossless: options.lossless || false,
              })
              .toBuffer();
            mimeType = 'image/avif';
            actualFormat = 'avif';
            break;

          case 'webp':
            processedImageBuffer = await processedInstance
              .webp({
                quality,
                effort: 3, // Balanced effort for WebP
                lossless: options.lossless || false,
                nearLossless: false,
                smartSubsample: true,
              })
              .toBuffer();
            mimeType = 'image/webp';
            actualFormat = 'webp';
            break;

          case 'jpeg':
          default:
            processedImageBuffer = await processedInstance
              .jpeg({
                quality,
                progressive: options.progressive !== false,
                mozjpeg: true,
                optimiseScans: true,
                overshootDeringing: true,
              })
              .toBuffer();
            mimeType = 'image/jpeg';
            actualFormat = 'jpeg';
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
        // Otherwise, continue to the next format in the fallback chain
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
    console.error(`Server image processing failed for ${imageUrl}:`, error);
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
  imageProperties: ImageProperties | null;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl?: string | null;
  options?: ImageProcessingOptions;
  acceptHeader?: string | null;
}) {
  const imageUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!imageUrl) return null;

  // Determine if we're using maxres based on which parameter was provided
  const isMaxRes = !!thumbnailMaxResUrl;

  return processImageServer({
    imageUrl,
    imageProperties,
    acceptHeader,
    options,
    isCropped: true,
    isMaxRes,
  });
}

// Enhanced video thumbnail processing with format support and optimization
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

  return processImageServer({
    imageUrl: thumbnailUrl,
    acceptHeader,
    options,
    isCropped: false,
  });
}

// Enhanced batch processing with concurrency control and memory management
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailUrls: Array<string | null>,
  options: ImageProcessingOptions = {},
  acceptHeader: string | null = null
): Promise<Array<string | null>> {
  if (thumbnailUrls.length === 0) return [];

  // Log memory usage before processing
  const initialMemory = getMemoryUsage();
  console.log(
    `Starting batch processing of ${thumbnailUrls.length} images. Memory: ${initialMemory.heapUsed}MB`
  );

  // Process in chunks to manage memory
  const chunkSize = MAX_CONCURRENT_PROCESSING;
  const results: Array<string | null> = [];

  for (let i = 0; i < thumbnailUrls.length; i += chunkSize) {
    const chunk = thumbnailUrls.slice(i, i + chunkSize);

    const chunkResults = await Promise.all(
      chunk.map((thumbnailUrl) =>
        getVideoThumbnailWebpUrlServer({ thumbnailUrl, options, acceptHeader })
      )
    );

    results.push(...chunkResults);

    // Force garbage collection between chunks if available
    if (global.gc && i + chunkSize < thumbnailUrls.length) {
      global.gc();
    }
  }

  // Log final memory usage
  const finalMemory = getMemoryUsage();
  console.log(
    `Batch processing complete. Memory: ${finalMemory.heapUsed}MB (${finalMemory.heapUsed - initialMemory.heapUsed > 0 ? '+' : ''}${finalMemory.heapUsed - initialMemory.heapUsed}MB)`
  );

  return results;
}

export async function getCroppedPlaylistImageUrlsBatch(
  requests: Array<{
    imageProperties: ImageProperties | null;
    thumbnailMaxResUrl: string | null;
    thumbnailUrl?: string | null;
    options?: ImageProcessingOptions;
    acceptHeader?: string | null;
  }>
): Promise<Array<string | null>> {
  if (requests.length === 0) return [];

  // Process in chunks for memory management
  const chunkSize = MAX_CONCURRENT_PROCESSING;
  const results: Array<string | null> = [];

  for (let i = 0; i < requests.length; i += chunkSize) {
    const chunk = requests.slice(i, i + chunkSize);

    const chunkResults = await Promise.all(
      chunk.map((request) => getCroppedPlaylistImageUrlServer(request))
    );

    results.push(...chunkResults);

    // Force garbage collection between chunks if available
    if (global.gc && i + chunkSize < requests.length) {
      global.gc();
    }
  }

  return results;
}

// Progressive image generation for responsive loading
export async function generateProgressiveImages(
  thumbnailUrl: string,
  sizes: Array<{ width: number; height: number; quality?: number }>,
  acceptHeader: string | null = null
): Promise<Array<{ size: string; dataUrl: string | null }>> {
  const results: Array<{ size: string; dataUrl: string | null }> = [];

  for (const size of sizes) {
    try {
      const dataUrl = await getVideoThumbnailWebpUrlServer({
        thumbnailUrl,
        options: {
          width: size.width,
          height: size.height,
          quality: size.quality || 85,
          format: 'auto', // Let it detect optimal format
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

// Fetch with retry logic for better reliability
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  delay = 1000
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

      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, attempt - 1))
      );
    }
  }

  throw lastError;
}

/**
 * Updated validation function that handles YouTube thumbnail sizes correctly
 */
function validateAndAdjustCropDimensions(
  imageProperties: ImageProperties,
  imageWidth: number,
  imageHeight: number,
  imageType: 'maxres' | 'standard'
): ImageProperties {
  if (imageWidth > 0 && imageHeight > 0) {
    let scaledProperties = { ...imageProperties };

    if (imageType === 'standard') {
      // Handle known YouTube thumbnail sizes
      const isYouTubeMedium = imageWidth === 320 && imageHeight === 180;
      const isYouTubeDefault = imageWidth === 120 && imageHeight === 90;
      const isYouTubeHigh = imageWidth === 480 && imageHeight === 360;

      if (isYouTubeMedium) {
        // 320x180 medium: crop 180x180 square from center
        scaledProperties = {
          x: Math.round((320 - 180) / 2), // 70px from left
          y: 0,
          width: 180,
          height: 180,
        };
      } else if (isYouTubeDefault) {
        // 120x90 default: crop 90x90 square from center
        scaledProperties = {
          x: Math.round((120 - 90) / 2), // 15px from left
          y: 0,
          width: 90,
          height: 90,
        };
      } else if (isYouTubeHigh) {
        // 480x360 high: crop 360x360 square from center
        scaledProperties = {
          x: Math.round((480 - 360) / 2), // 60px from left
          y: 0,
          width: 360,
          height: 360,
        };
      } else {
        // For other standard sizes, create a square crop centered on the image
        const cropSize = Math.min(imageWidth, imageHeight);
        scaledProperties = {
          x: Math.round((imageWidth - cropSize) / 2),
          y: Math.round((imageHeight - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        };
      }
    } else {
      // For maxres images, use properties as-is but validate bounds
      scaledProperties = { ...imageProperties };
    }

    // Ensure crop area is within image bounds
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

// Image cache management functions
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

// Helper function to generate playlist image URL - returns original URL to avoid server-side processing
export function generatePlaylistImageUrl({
  thumbnailUrl,
  thumbnailMaxResUrl,
  imageProperties,
  format = 'auto',
  quality = 90,
  responseType = 'image',
}: {
  thumbnailUrl?: string | null;
  thumbnailMaxResUrl?: string | null;
  imageProperties?: ImageProperties | null;
  format?: 'auto' | 'webp' | 'jpeg' | 'avif';
  quality?: number;
  responseType?: 'image' | 'json';
}): string | null {
  const effectiveUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!effectiveUrl) return null;

  // Return original URL directly - no server-side processing
  // Background processing system handles optimization separately
  return effectiveUrl;
}

/**
 * Queue playlist image processing for background optimization
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
    const { inngest } = await import('../inngest/client');
    await inngest.send({
      name: 'image.batch.process',
      data: { jobs },
    });
  }
}
