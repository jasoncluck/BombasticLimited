import { PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS } from '$lib/components/playlist/playlist-service';
import sharp from 'sharp';
import { ImageCacheManager } from './image-cache';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { validateAndAdjustCropDimensions } from '$lib/utils/dynamic-crop-dimensions';
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

// **OPTIMIZED: Balanced quality for WebP processing efficiency**
export function calculateOptimalQuality(
  metadata: Partial<sharp.Metadata>,
  targetFormat: string,
  baseQuality = 78 // **IMPROVED: Slightly higher base for WebP efficiency**
): number {
  const imageSize = (metadata.width || 0) * (metadata.height || 0);

  // **ENHANCED: Format-specific quality optimization**
  let formatQuality = baseQuality;
  if (targetFormat === 'avif') {
    formatQuality = Math.max(baseQuality - 8, 68); // **IMPROVED: Less aggressive AVIF reduction**
  } else if (targetFormat === 'webp') {
    // WebP handles quality differently - optimize for its compression characteristics
    formatQuality = Math.max(baseQuality - 3, 75); // **IMPROVED: Better WebP quality**
  }

  // **ENHANCED: Smarter size-based quality adjustment**
  if (imageSize > 1920 * 1080) {
    // Large images can use slightly lower quality due to viewing distance
    return Math.max(formatQuality - 3, 72); // **IMPROVED: Less aggressive reduction**
  } else if (imageSize < 320 * 180) {
    // Very small thumbnails need even higher quality (check this first)
    return Math.min(formatQuality + 5, 88); // **NEW: Special handling for tiny images**
  } else if (imageSize < 640 * 360) {
    // Small images need higher quality to remain sharp
    return Math.min(formatQuality + 3, 85); // **BALANCED: Moderate increase**
  }

  return formatQuality;
}

export async function processImageServer({
  imageUrl,
  imageProperties = null,
  acceptHeader = null,
  options = {},
  isCropped = false,
  isMaxRes = false,
  contentType = 'video',
}: {
  imageUrl: string | null;
  imageProperties?: PlaylistImageProperties | null;
  acceptHeader?: string | null;
  options?: ImageProcessingOptions;
  isCropped?: boolean;
  isMaxRes?: boolean;
  contentType?: 'playlist' | 'video';
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

  // **ENHANCED: Improved format fallback chain prioritizing WebP**
  const formatFallbackChain: ('avif' | 'webp' | 'jpeg')[] = acceptHeader
    ? targetFormat === 'avif'
      ? ['avif', 'webp', 'jpeg'] // AVIF first when explicitly supported
      : targetFormat === 'webp'
      ? ['webp', 'jpeg'] // WebP focused chain  
      : ['webp', 'jpeg'] // Default to WebP for better compression
    : ['webp', 'jpeg']; // **OPTIMIZED: Always prefer WebP for external sources**

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
        imageProperties ?? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS;

      // Validate and adjust crop dimensions
      const validatedCrop = validateAndAdjustCropDimensions(
        cropProperties,
        imageWidth,
        imageHeight,
        'maxres'
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

    processedInstance = processedInstance.toColourspace('srgb');

    // **ENHANCED: Improved quality calculation for WebP optimization**
    const quality =
      options.quality ||
      calculateOptimalQuality(
        metadata,
        targetFormat,
        isStandardResolution ? 78 : 75 // **IMPROVED: Better base quality for WebP**
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
                effort: 2, // **IMPROVED: Better compression vs speed balance**
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
  thumbnailUrl,
  options = {},
  acceptHeader = null,
}: {
  imageProperties: PlaylistImageProperties | null;
  thumbnailUrl?: string;
  options?: ImageProcessingOptions;
  acceptHeader?: string | null;
}) {
  if (!thumbnailUrl) return null;

  return processImageServer({
    imageUrl: thumbnailUrl,
    imageProperties,
    acceptHeader,
    options,
    isCropped: true,
    isMaxRes: false,
    contentType: 'playlist',
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

// **ENHANCED: Improved progressive image generation with better WebP**
export async function generateProgressiveImages(
  thumbnailUrl: string,
  sizes: Array<{ width: number; height: number; quality?: number }>,
  acceptHeader: string | null = null
): Promise<Array<{ size: string; dataUrl: string | null }>> {
  const results: Array<{ size: string; dataUrl: string | null }> = [];

  // **ENHANCED: Process optimal number of sizes for WebP**
  const limitedSizes = sizes.slice(0, 4); // **IMPROVED: Support one more size for better progressive loading**

  for (const size of limitedSizes) {
    try {
      const dataUrl = await getVideoThumbnailWebpUrlServer({
        thumbnailUrl,
        options: {
          width: Math.min(size.width, 480), // **IMPROVED: Allow larger sizes for WebP efficiency**
          height: Math.min(size.height, 480), // **IMPROVED: Allow larger sizes**
          quality: Math.min(size.quality || 80, 85), // **IMPROVED: Better default quality**
          format: 'webp', // **ENHANCED: Force WebP for optimal compression**
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

// Image cache management functions (unchanged)
export async function clearImageCache(): Promise<void> {
  await imageCacheManager.clear();
}

export async function getImageCacheStats(): Promise<{
  entries: number;
  size: number;
}> {
  return imageCacheManager.getStats();
}

export async function cleanupImageCache(): Promise<void> {
  await imageCacheManager.cleanup();
}

// **SPEED: Direct URL return for fastest response**
export function generatePlaylistImageUrl({
  thumbnailUrl,
}: {
  thumbnailUrl?: string | null;
  imageProperties?: PlaylistImageProperties | null;
  format?: 'auto' | 'webp' | 'jpeg' | 'avif';
  quality?: number;
  responseType?: 'image' | 'json';
}): string | null {
  if (!thumbnailUrl) return null;

  // **SPEED: Return original URL directly for fastest response**
  // Background processing system handles optimization separately
  return thumbnailUrl;
}

// **ENHANCED: Batch processing function for video thumbnails with better WebP**
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailData: Array<{ url: string }>
): Promise<string[]> {
  const results = await Promise.all(
    thumbnailData.map(async ({ url }) => {
      try {
        return await getVideoThumbnailWebpUrlServer({
          thumbnailUrl: url,
          acceptHeader: 'image/webp,image/jpeg,*/*',
          options: { format: 'webp', quality: 82 }, // **IMPROVED: Better quality for batch processing**
        });
      } catch (error) {
        console.warn(`Failed to process video thumbnail ${url}:`, error);
        return null;
      }
    })
  );

  return results.filter((result): result is string => result !== null);
}
