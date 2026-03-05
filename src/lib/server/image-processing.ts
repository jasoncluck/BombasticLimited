import sharp from 'sharp';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import { validateAndAdjustCropDimensions } from '$lib/utils/dynamic-crop-dimensions';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

// **SPEED-BALANCED** image processing configuration
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

// **SPEED-BALANCED: Improved quality for WebP processing efficiency**
export function calculateOptimalQuality(
  metadata: Partial<sharp.Metadata>,
  targetFormat: string,
  baseQuality = 80 // **IMPROVED: Slightly higher base, not too aggressive**
): number {
  const imageSize = (metadata.width || 0) * (metadata.height || 0);

  // **BALANCED: Format-specific quality optimization**
  let formatQuality = baseQuality;
  if (targetFormat === 'avif') {
    formatQuality = Math.max(baseQuality - 10, 68); // **BALANCED: Moderate AVIF reduction**
  } else if (targetFormat === 'webp') {
    // WebP handles quality differently - optimize for its compression characteristics
    formatQuality = Math.max(baseQuality - 5, 75); // **BALANCED: Conservative WebP adjustment**
  }

  if (imageSize > 1920 * 1080) {
    // Large images can use slightly lower quality due to viewing distance
    return Math.max(formatQuality - 5, 70); // **BALANCED: Moderate reduction**
  } else if (imageSize < 320 * 180) {
    // Very small thumbnails need higher quality (check this first)
    return Math.min(formatQuality + 6, 88); // **BALANCED: Reasonable boost for tiny images**
  } else if (imageSize < 640 * 360) {
    // Small images need higher quality to remain sharp
    return Math.min(formatQuality + 4, 85); // **BALANCED: Moderate increase**
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

  // **SPEED-FOCUSED: Optimized format fallback chain**
  const formatFallbackChain: ('avif' | 'webp' | 'jpeg')[] = acceptHeader
    ? targetFormat === 'avif'
      ? ['avif', 'webp', 'jpeg'] // AVIF first when explicitly supported
      : targetFormat === 'webp'
        ? ['webp', 'jpeg'] // WebP focused chain
        : ['webp', 'jpeg'] // Default to WebP for better compression
    : ['webp', 'jpeg']; // **OPTIMIZED: Always prefer WebP for external sources**

  try {
    // **SPEED: Reasonable timeout for quality/speed balance**
    const response = await fetchWithRetry(imageUrl, {
      signal: AbortSignal.timeout(6000), // **BALANCED: Slightly longer than original**
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
      density: 96, // **IMPROVED: Better density without going overboard (was 72)**
      pages: 1,
    });

    // Get image metadata for optimization
    const metadata = await sharpInstance.metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    let processedInstance = sharpInstance;

    // Apply cropping if needed
    if (isCropped) {
      // Always use dynamic crop calculation when imageProperties is null
      // Validate and adjust crop dimensions - always treat as 'standard' type
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
        imageProperties // Original custom properties (null if none provided)
      );

      // Extract the crop area
      processedInstance = processedInstance.extract({
        left: validatedCrop.x,
        top: validatedCrop.y,
        width: validatedCrop.width,
        height: validatedCrop.height,
      });

      // **SPEED-BALANCED: Better output size without going too large**
      const previewSize = 240; // **IMPROVED: Larger than 180px but not excessive**
      processedInstance = processedInstance.resize(previewSize, previewSize, {
        fit: 'cover',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos2, // **IMPROVED: Better quality than nearest, faster than lanczos3**
      });

      // **SPEED-BALANCED: Light sharpening only for cropped images**
      processedInstance = processedInstance.sharpen({
        sigma: 0.5, // **LIGHT: Minimal sharpening to avoid processing overhead**
        m1: 0.8,
        m2: 1.5,
        x1: 2.0,
        y2: 6.0,
        y3: 12.0,
      });
    }

    // **SPEED-BALANCED: Better resize for non-cropped images**
    if (!isCropped && (options.width || options.height)) {
      const maxSize = Math.min(
        options.width || 400, // **IMPROVED: Slightly larger than 320px**
        options.height || 400,
        400
      ); // **BALANCED: Better size without being excessive**
      processedInstance = processedInstance.resize(maxSize, maxSize, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos2, // **IMPROVED: Better resampling than nearest**
      });
    }

    processedInstance = processedInstance.toColourspace('srgb');

    // **BALANCED: Improved quality calculation**
    const quality =
      options.quality ||
      calculateOptimalQuality(
        metadata,
        targetFormat,
        80 // **IMPROVED: Higher base quality than 75**
      );

    let processedImageBuffer: Buffer | undefined;
    let mimeType: string = 'image/jpeg';

    for (const format of formatFallbackChain) {
      try {
        switch (format) {
          case 'avif':
            processedImageBuffer = await processedInstance
              .avif({
                quality: Math.min(quality, 78), // **BALANCED: Slightly higher max quality**
                effort: 3, // **BALANCED: Better than 2, not as slow as 4+**
                lossless: false,
              })
              .toBuffer();
            mimeType = 'image/avif';
            break;

          case 'webp':
            processedImageBuffer = await processedInstance
              .webp({
                quality,
                effort: 3, // **BALANCED: Better compression vs speed balance**
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
                progressive: false, // **SPEED: Keep progressive disabled for speed**
                mozjpeg: false, // **SPEED: Keep standard JPEG encoder for speed**
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
      `Balanced server image processing failed for ${imageUrl}:`,
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
    contentType: 'playlist',
  });
}

// **SPEED-BALANCED** video thumbnail processing
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

  // **SPEED-BALANCED: Better dimensions for video thumbnails**
  const balancedOptions = {
    ...options,
    width: Math.min(options.width || 400, 400), // **IMPROVED: Better than 320px**
    height: Math.min(options.height || 400, 400),
  };

  return processImageServer({
    imageUrl: thumbnailUrl,
    acceptHeader,
    options: balancedOptions,
    isCropped: false,
    contentType: 'video',
  });
}

// **BALANCED: Improved progressive image generation**
export async function generateProgressiveImages(
  thumbnailUrl: string,
  sizes: Array<{ width: number; height: number; quality?: number }>,
  acceptHeader: string | null = null
): Promise<Array<{ size: string; dataUrl: string | null }>> {
  const results: Array<{ size: string; dataUrl: string | null }> = [];

  // **BALANCED: Process reasonable number of sizes**
  const limitedSizes = sizes.slice(0, 4);

  for (const size of limitedSizes) {
    try {
      const dataUrl = await getVideoThumbnailWebpUrlServer({
        thumbnailUrl,
        options: {
          width: Math.min(size.width, 500), // **BALANCED: Allow larger sizes**
          height: Math.min(size.height, 500),
          quality: Math.min(size.quality || 82, 87), // **IMPROVED: Better default quality**
          format: 'webp',
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

// **SPEED-BALANCED: Faster fetch with reasonable timeouts**
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2, // **SPEED: Keep retries low**
  delay = 600 // **BALANCED: Slightly longer delay**
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

      // **SPEED: Reasonable exponential backoff**
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(1.6, attempt - 1))
      );
    }
  }

  throw lastError;
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

// **BALANCED: Better batch processing for video thumbnails**
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailData: Array<{ url: string }>
): Promise<string[]> {
  const results = await Promise.all(
    thumbnailData.map(async ({ url }) => {
      try {
        return await getVideoThumbnailWebpUrlServer({
          thumbnailUrl: url,
          acceptHeader: 'image/webp,image/jpeg,*/*',
          options: { format: 'webp', quality: 83 }, // **IMPROVED: Better quality for batch**
        });
      } catch (error) {
        console.warn(`Failed to process video thumbnail ${url}:`, error);
        return null;
      }
    })
  );

  return results.filter((result): result is string => result !== null);
}
