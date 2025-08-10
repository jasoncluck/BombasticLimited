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
  type ImageCacheMetadata
} from './image-cache';

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
        .find(cookie => cookie.trim().startsWith('sb-127-auth-token'));
      
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

// Browser format support detection
export function detectOptimalFormat(acceptHeader?: string | null): 'avif' | 'webp' | 'jpeg' {
  if (!acceptHeader) return 'webp'; // Default to WebP
  
  const accept = acceptHeader.toLowerCase();
  if (accept.includes('image/avif')) return 'avif';
  if (accept.includes('image/webp')) return 'webp';
  return 'jpeg';
}

// Smart quality adjustment based on image content and size
export function calculateOptimalQuality(
  metadata: sharp.Metadata,
  targetFormat: string,
  baseQuality = 90
): number {
  const imageSize = (metadata.width || 0) * (metadata.height || 0);
  
  // Adjust quality based on image size
  if (imageSize > 1920 * 1080) { // Large images
    return targetFormat === 'jpeg' ? Math.max(baseQuality - 10, 75) : Math.max(baseQuality - 5, 85);
  } else if (imageSize < 640 * 360) { // Small images
    return Math.min(baseQuality + 5, 95);
  }
  
  return baseQuality;
}

export async function getCroppedPlaylistImageUrlServer({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
  options = {},
  request,
}: {
  imageProperties: ImageProperties | null;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl?: string | null;
  options?: ImageProcessingOptions;
  request?: Request;
}) {
  const imageUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!imageUrl) return null;

  if (!imageProperties) {
    imageProperties = thumbnailMaxResUrl
      ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
      : PLAYLIST_IMAGE_CROP_DEFAULTS;
  }

  // Initialize cache manager
  await imageCacheManager.initialize();

  // Detect auth state and user ID
  const authState = detectAuthState(request);
  const userId = extractUserId(request);

  // Generate cache key
  const cacheKey = generatePlaylistImageCacheKey(
    imageUrl,
    imageProperties,
    options,
    authState
  );

  // Check cache first
  try {
    const cachedResult = await imageCacheManager.get(cacheKey, userId, authState);
    if (cachedResult) {
      console.log(`Cache hit for playlist image: ${imageUrl}`);
      return cachedResult;
    }
  } catch (error) {
    console.warn('Error reading from image cache:', error);
  }

  // Determine if we're using standard resolution (thumbnail_url only)
  const isStandardResolution = !thumbnailMaxResUrl && thumbnailUrl;

  try {
    // Fetch image with optimized settings and retry logic
    const response = await fetchWithRetry(imageUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Playlist-Service/1.0',
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

    // Get image metadata to validate crop dimensions
    const metadata = await sharpInstance.metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    // Validate and adjust crop dimensions
    const validatedCrop = validateAndAdjustCropDimensions(
      imageProperties,
      imageWidth,
      imageHeight,
      thumbnailMaxResUrl ? 'maxres' : 'standard'
    );

    // Extract the crop area
    const processedInstance = sharpInstance.extract({
      left: validatedCrop.x,
      top: validatedCrop.y,
      width: validatedCrop.width,
      height: validatedCrop.height,
    });

    // Determine output format
    const targetFormat = options.format === 'auto' ? 'webp' : (options.format || 'webp');
    const quality = options.quality || calculateOptimalQuality(metadata, targetFormat, isStandardResolution ? 95 : 90);

    let processedImageBuffer: Buffer;
    let mimeType: string;

    // Enhanced format handling with progressive loading support
    switch (targetFormat) {
      case 'avif':
        processedImageBuffer = await processedInstance
          .avif({
            quality: Math.min(quality, 85), // AVIF handles lower quality better
            effort: 4, // Higher effort for better compression
            lossless: options.lossless || false,
          })
          .toBuffer();
        mimeType = 'image/avif';
        break;
      
      case 'webp':
        processedImageBuffer = await processedInstance
          .webp({
            quality,
            effort: 3, // Balanced effort for WebP
            lossless: options.lossless || false,
            nearLossless: false,
            smartSubsample: true,
            // Progressive is not available for WebP, handled by format itself
          })
          .toBuffer();
        mimeType = 'image/webp';
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
        break;
    }

    // Convert to base64 data URL
    const base64 = processedImageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Store in cache
    try {
      await imageCacheManager.set(
        cacheKey,
        dataUrl,
        imageUrl,
        options,
        userId,
        authState
      );
      console.log(`Cached playlist image: ${imageUrl} (auth: ${authState})`);
    } catch (error) {
      console.warn('Error storing to image cache:', error);
    }

    return dataUrl;
  } catch (error) {
    console.error('Server image processing failed:', error);
    return null;
  }
}

// Enhanced video thumbnail processing with format support and optimization
export async function getVideoThumbnailWebpUrlServer({
  thumbnailUrl,
  options = {},
  request,
}: {
  thumbnailUrl: string | null;
  options?: ImageProcessingOptions;
  request?: Request;
}) {
  if (!thumbnailUrl) return null;

  // Initialize cache manager
  await imageCacheManager.initialize();

  // Detect auth state and user ID
  const authState = detectAuthState(request);
  const userId = extractUserId(request);

  // Generate cache key
  const cacheKey = generateImageCacheKey(thumbnailUrl, options, authState);

  // Check cache first
  try {
    const cachedResult = await imageCacheManager.get(cacheKey, userId, authState);
    if (cachedResult) {
      console.log(`Cache hit for video thumbnail: ${thumbnailUrl}`);
      return cachedResult;
    }
  } catch (error) {
    console.warn('Error reading from image cache:', error);
  }

  try {
    const response = await fetchWithRetry(thumbnailUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Video-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    const imageBuffer = await response.arrayBuffer();

    const sharpInstance = sharp(imageBuffer, {
      failOnError: false,
      density: 72,
      pages: 1,
    });

    // Get metadata for smart optimization
    const metadata = await sharpInstance.metadata();
    
    // Determine output format
    const targetFormat = options.format === 'auto' ? 'webp' : (options.format || 'webp');
    const quality = options.quality || calculateOptimalQuality(metadata, targetFormat, 90);

    let processedImageBuffer: Buffer;
    let mimeType: string;

    // Apply resize if specified
    let pipeline = sharpInstance;
    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width, options.height, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: true,
      });
    }

    // Enhanced format handling
    switch (targetFormat) {
      case 'avif':
        processedImageBuffer = await pipeline
          .avif({
            quality: Math.min(quality, 85),
            effort: 4,
            lossless: options.lossless || false,
          })
          .toBuffer();
        mimeType = 'image/avif';
        break;
      
      case 'webp':
        processedImageBuffer = await pipeline
          .webp({
            quality,
            effort: 3,
            lossless: options.lossless || false,
            nearLossless: false,
            smartSubsample: true,
            // Progressive is not available for WebP, handled by format itself
          })
          .toBuffer();
        mimeType = 'image/webp';
        break;
      
      case 'jpeg':
      default:
        processedImageBuffer = await pipeline
          .jpeg({
            quality,
            progressive: options.progressive !== false,
            mozjpeg: true,
            optimiseScans: true,
            overshootDeringing: true,
          })
          .toBuffer();
        mimeType = 'image/jpeg';
        break;
    }

    const base64 = processedImageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Store in cache
    try {
      await imageCacheManager.set(
        cacheKey,
        dataUrl,
        thumbnailUrl,
        options,
        userId,
        authState
      );
      console.log(`Cached video thumbnail: ${thumbnailUrl} (auth: ${authState})`);
    } catch (error) {
      console.warn('Error storing to image cache:', error);
    }

    return dataUrl;
  } catch (error) {
    console.error('Server video thumbnail processing failed:', error);
    return null;
  }
}

// Enhanced batch processing with concurrency control and memory management
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailUrls: Array<string | null>,
  options: ImageProcessingOptions = {},
  request?: Request
): Promise<Array<string | null>> {
  if (thumbnailUrls.length === 0) return [];
  
  // Log memory usage before processing
  const initialMemory = getMemoryUsage();
  console.log(`Starting batch processing of ${thumbnailUrls.length} images. Memory: ${initialMemory.heapUsed}MB`);
  
  // Process in chunks to manage memory
  const chunkSize = MAX_CONCURRENT_PROCESSING;
  const results: Array<string | null> = [];
  
  for (let i = 0; i < thumbnailUrls.length; i += chunkSize) {
    const chunk = thumbnailUrls.slice(i, i + chunkSize);
    
    const chunkResults = await Promise.all(
      chunk.map((thumbnailUrl) =>
        getVideoThumbnailWebpUrlServer({ thumbnailUrl, options, request })
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
  console.log(`Batch processing complete. Memory: ${finalMemory.heapUsed}MB (${finalMemory.heapUsed - initialMemory.heapUsed > 0 ? '+' : ''}${finalMemory.heapUsed - initialMemory.heapUsed}MB)`);
  
  return results;
}

export async function getCroppedPlaylistImageUrlsBatch(
  requests: Array<{
    imageProperties: ImageProperties | null;
    thumbnailMaxResUrl: string | null;
    thumbnailUrl?: string | null;
    options?: ImageProcessingOptions;
  }>,
  requestContext?: Request
): Promise<Array<string | null>> {
  if (requests.length === 0) return [];
  
  // Process in chunks for memory management
  const chunkSize = MAX_CONCURRENT_PROCESSING;
  const results: Array<string | null> = [];
  
  for (let i = 0; i < requests.length; i += chunkSize) {
    const chunk = requests.slice(i, i + chunkSize);
    
    const chunkResults = await Promise.all(
      chunk.map((request) => getCroppedPlaylistImageUrlServer({
        ...request,
        request: requestContext
      }))
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
  request?: Request
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
          format: 'webp',
        },
        request,
      });
      
      results.push({
        size: `${size.width}x${size.height}`,
        dataUrl,
      });
    } catch (error) {
      console.error(`Failed to generate ${size.width}x${size.height} image:`, error);
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
      if (attempt === maxRetries || (error as Error).message.includes('Client error')) {
        break;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
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
export async function clearImageCache(authState?: 'auth' | 'anon'): Promise<void> {
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
