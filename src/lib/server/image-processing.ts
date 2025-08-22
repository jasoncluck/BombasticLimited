import sharp from 'sharp';
import { ImageCacheManager } from './image-cache';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { validateAndAdjustCropDimensions } from '$lib/utils/dynamic-crop-dimensions';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

// Initialize image cache manager
const imageCacheManager = ImageCacheManager.getInstance();

// **BALANCED QUALITY** image processing configuration
export interface ImageProcessingOptions {
  format?: 'auto' | 'webp' | 'jpeg' | 'avif';
  quality?: number;
  width?: number;
  height?: number;
  progressive?: boolean;
  lossless?: boolean;
  highQuality?: boolean; // **NEW: Optional high quality mode**
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

// **IMPROVED: Better quality calculation matching async processor**
export function calculateOptimalQuality(
  metadata: Partial<sharp.Metadata>,
  targetFormat: string,
  baseQuality = 82, // **IMPROVED: Higher base quality**
  highQuality = false
): number {
  const imageSize = (metadata.width || 0) * (metadata.height || 0);

  // **IMPROVED: Better format-specific quality optimization**
  let formatQuality = baseQuality;
  if (targetFormat === 'avif') {
    formatQuality = Math.max(baseQuality - 12, 65); // **IMPROVED: Better AVIF quality**
  } else if (targetFormat === 'webp') {
    formatQuality = Math.max(baseQuality - 5, 75); // **IMPROVED: Better WebP quality**
  }

  // **NEW: High quality mode for better results**
  if (highQuality) {
    formatQuality = Math.min(formatQuality + 8, 92);
  }

  if (imageSize > 1920 * 1080) {
    // Large images can use slightly lower quality
    return Math.max(formatQuality - 5, 70);
  } else if (imageSize < 320 * 180) {
    // Very small thumbnails need higher quality
    return Math.min(formatQuality + 8, 90);
  } else if (imageSize < 640 * 360) {
    // Small images need higher quality to remain sharp
    return Math.min(formatQuality + 5, 88);
  }

  return formatQuality;
}

export async function processImageServer({
  imageUrl,
  imageProperties = null,
  acceptHeader = null,
  options = {},
  isCropped = false,
  contentType = 'video',
}: {
  imageUrl: string | null;
  imageProperties?: PlaylistImageProperties | null;
  acceptHeader?: string | null;
  options?: ImageProcessingOptions;
  isCropped?: boolean;
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

  const formatFallbackChain: ('avif' | 'webp' | 'jpeg')[] = acceptHeader
    ? targetFormat === 'avif'
      ? ['avif', 'webp', 'jpeg']
      : targetFormat === 'webp'
        ? ['webp', 'jpeg']
        : ['webp', 'jpeg']
    : ['webp', 'jpeg'];

  try {
    const response = await fetchWithRetry(imageUrl, {
      signal: AbortSignal.timeout(8000), // **IMPROVED: Slightly longer timeout for quality**
      headers: {
        Accept: 'image/*',
        'User-Agent': isCropped ? 'Playlist-Service/1.0' : 'Video-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    const imageBuffer = await response.arrayBuffer();

    // **IMPROVED: Better Sharp configuration for quality**
    const sharpInstance = sharp(imageBuffer, {
      failOnError: false,
      density: options.highQuality ? 150 : 96, // **IMPROVED: Better density**
      pages: 1,
      limitInputPixels: false, // **NEW: Allow larger images**
    });

    // Get image metadata for optimization
    const metadata = await sharpInstance.metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    let processedInstance = sharpInstance;

    // Apply cropping if needed
    if (isCropped) {
      const validatedCrop = validateAndAdjustCropDimensions(
        imageProperties || {
          x: 0,
          y: 0,
          width: imageWidth,
          height: imageHeight,
        },
        imageWidth,
        imageHeight,
        'standard',
        imageProperties
      );

      processedInstance = processedInstance.extract({
        left: validatedCrop.x,
        top: validatedCrop.y,
        width: validatedCrop.width,
        height: validatedCrop.height,
      });

      // **IMPROVED: Smart output sizing based on crop size**
      const cropSize = Math.min(validatedCrop.width, validatedCrop.height);
      let outputSize: number;

      if (options.highQuality) {
        // High quality mode - larger outputs
        if (cropSize <= 180) {
          outputSize = 384; // 2x larger for small crops
        } else if (cropSize <= 360) {
          outputSize = 512; // Better quality for medium crops
        } else {
          outputSize = 768; // High quality for large crops
        }
      } else {
        // Balanced mode
        if (cropSize <= 180) {
          outputSize = 256; // Better than 180px
        } else if (cropSize <= 360) {
          outputSize = 384; // Improved medium size
        } else {
          outputSize = 512; // Better large size
        }
      }

      processedInstance = processedInstance.resize(outputSize, outputSize, {
        fit: 'cover',
        withoutEnlargement: false,
        kernel: options.highQuality
          ? sharp.kernel.lanczos3
          : sharp.kernel.lanczos2, // **IMPROVED: Better resampling**
      });

      // **NEW: Add sharpening for cropped images**
      if (options.highQuality) {
        processedInstance = processedInstance.sharpen({
          sigma: 0.8,
          m1: 1.0,
          m2: 1.8,
          x1: 2.0,
          y2: 8.0,
          y3: 15.0,
        });
      }
    }

    // **IMPROVED: Resize for non-cropped images with better sizing**
    if (!isCropped && (options.width || options.height)) {
      const maxSize = options.highQuality
        ? Math.min(options.width || 640, options.height || 640, 640) // **IMPROVED: Larger max size**
        : Math.min(options.width || 480, options.height || 480, 480); // **IMPROVED: Better default size**

      processedInstance = processedInstance.resize(maxSize, maxSize, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: true,
        kernel: options.highQuality
          ? sharp.kernel.lanczos3
          : sharp.kernel.lanczos2, // **IMPROVED: Better resampling**
      });
    }

    // **IMPROVED: Better color space handling**
    processedInstance = processedInstance.toColourspace('srgb');

    // **IMPROVED: Better quality calculation**
    const quality =
      options.quality ||
      calculateOptimalQuality(
        metadata,
        targetFormat,
        82, // **IMPROVED: Higher base quality**
        options.highQuality || false
      );

    console.log(
      `🖼️ Processing ${contentType} image: ${targetFormat}, quality: ${quality}, size: ${imageWidth}x${imageHeight}, highQuality: ${options.highQuality || false}`
    );

    let processedImageBuffer: Buffer | undefined;
    let mimeType: string = 'image/jpeg';

    for (const format of formatFallbackChain) {
      try {
        switch (format) {
          case 'avif':
            processedImageBuffer = await processedInstance
              .avif({
                quality: Math.min(quality, 80), // **IMPROVED: Better max quality**
                effort: options.highQuality ? 6 : 4, // **IMPROVED: Better effort balance**
                lossless: false,
                chromaSubsampling: options.highQuality ? '4:4:4' : '4:2:0', // **NEW: Better chroma for HQ**
              })
              .toBuffer();
            mimeType = 'image/avif';
            break;

          case 'webp':
            processedImageBuffer = await processedInstance
              .webp({
                quality,
                effort: options.highQuality ? 6 : 4, // **IMPROVED: Better effort balance**
                lossless: false,
                nearLossless: false,
                smartSubsample: true,
                preset: 'photo',
                alphaQuality: options.highQuality ? 90 : 80, // **NEW: Better alpha quality**
              })
              .toBuffer();
            mimeType = 'image/webp';
            break;

          case 'jpeg':
            processedImageBuffer = await processedInstance
              .jpeg({
                quality,
                progressive: options.highQuality, // **IMPROVED: Progressive for HQ mode**
                mozjpeg: options.highQuality, // **IMPROVED: Better encoder for HQ**
                optimiseScans: options.highQuality, // **NEW: Better optimization**
              })
              .toBuffer();
            mimeType = 'image/jpeg';
            break;
        }

        break;
      } catch (formatError) {
        console.warn(
          `Failed to process image with ${format} format, trying next fallback:`,
          formatError
        );

        if (format === formatFallbackChain[formatFallbackChain.length - 1]) {
          throw formatError;
        }
      }
    }

    if (!processedImageBuffer) {
      throw new Error('Failed to process image with any available format');
    }

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

  // **IMPROVED: Enable high quality for playlist images**
  const enhancedOptions = {
    ...options,
    highQuality: options.highQuality !== false, // Default to true for playlists
  };

  return processImageServer({
    imageUrl: thumbnailUrl,
    imageProperties,
    acceptHeader,
    options: enhancedOptions,
    isCropped: true,
    contentType: 'playlist',
  });
}

// **IMPROVED: Better video thumbnail processing**
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

  // **IMPROVED: Better sizing for video thumbnails**
  const enhancedOptions = {
    ...options,
    width: Math.min(options.width || 480, options.highQuality ? 640 : 480), // **IMPROVED: Better default size**
    height: Math.min(options.height || 480, options.highQuality ? 640 : 480),
  };

  return processImageServer({
    imageUrl: thumbnailUrl,
    acceptHeader,
    options: enhancedOptions,
    isCropped: false,
    contentType: 'video',
  });
}

// **IMPROVED: Better progressive image generation**
export async function generateProgressiveImages(
  thumbnailUrl: string,
  sizes: Array<{ width: number; height: number; quality?: number }>,
  acceptHeader: string | null = null
): Promise<Array<{ size: string; dataUrl: string | null }>> {
  const results: Array<{ size: string; dataUrl: string | null }> = [];
  const limitedSizes = sizes.slice(0, 4);

  for (const size of limitedSizes) {
    try {
      const dataUrl = await getVideoThumbnailWebpUrlServer({
        thumbnailUrl,
        options: {
          width: Math.min(size.width, 640), // **IMPROVED: Larger max size**
          height: Math.min(size.height, 640),
          quality: Math.min(size.quality || 85, 90), // **IMPROVED: Better quality**
          format: 'webp',
          highQuality: size.width > 320 || size.height > 320, // **NEW: Auto HQ for larger sizes**
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

// **IMPROVED: Better fetch with longer timeouts for quality**
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3, // **IMPROVED: More retries for reliability**
  delay = 750 // **IMPROVED: Slightly longer delay**
): Promise<Response> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }

      throw new Error(`Server error: ${response.status}`);
    } catch (error) {
      lastError = error as Error;

      if (
        attempt === maxRetries ||
        (error as Error).message.includes('Client error')
      ) {
        break;
      }

      await new Promise(
        (resolve) => setTimeout(resolve, delay * Math.pow(1.8, attempt - 1)) // **IMPROVED: Better backoff**
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

// **IMPROVED: Smart URL generation**
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
  return thumbnailUrl;
}

// **IMPROVED: Better batch processing**
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailData: Array<{ url: string }>
): Promise<string[]> {
  const results = await Promise.all(
    thumbnailData.map(async ({ url }) => {
      try {
        return await getVideoThumbnailWebpUrlServer({
          thumbnailUrl: url,
          acceptHeader: 'image/webp,image/jpeg,*/*',
          options: {
            format: 'webp',
            quality: 85, // **IMPROVED: Better quality**
            highQuality: false, // Balanced for batch processing
          },
        });
      } catch (error) {
        console.warn(`Failed to process video thumbnail ${url}:`, error);
        return null;
      }
    })
  );

  return results.filter((result): result is string => result !== null);
}
