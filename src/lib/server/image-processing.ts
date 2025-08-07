import type { ImageProperties } from '$lib/components/playlist/playlist';
import {
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
  PLAYLIST_IMAGE_CROP_DEFAULTS,
} from '$lib/components/playlist/playlist-service';
import sharp from 'sharp';

export async function getCroppedPlaylistImageUrlServer({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
}: {
  imageProperties: ImageProperties | null;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl?: string | null;
}) {
  const imageUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!imageUrl) return null;

  if (!imageProperties) {
    imageProperties = thumbnailMaxResUrl
      ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
      : PLAYLIST_IMAGE_CROP_DEFAULTS;
  }

  // Determine if we're using standard resolution (thumbnail_url only)
  const isStandardResolution = !thumbnailMaxResUrl && thumbnailUrl;

  try {
    // Fetch image with optimized settings
    const response = await fetch(imageUrl, {
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
      density: isStandardResolution ? 150 : 72, // Higher density for small images
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
    let processedInstance = sharpInstance.extract({
      left: validatedCrop.x,
      top: validatedCrop.y,
      width: validatedCrop.width,
      height: validatedCrop.height,
    });

    // Apply upscaling for small standard resolution images
    if (isStandardResolution) {
      const shouldUpscale =
        validatedCrop.width < 320 || validatedCrop.height < 320; // Increased threshold

      if (shouldUpscale) {
        // Enhanced target size for better quality on modern displays
        const targetSize = validatedCrop.width <= 180 ? 384 : 320; // Larger for very small crops
        console.log(
          `Upscaling from ${validatedCrop.width}x${validatedCrop.height} to ${targetSize}x${targetSize}`
        );

        processedInstance = processedInstance.resize(targetSize, targetSize, {
          kernel: 'lanczos3', // High-quality upscaling kernel
          fit: 'fill',
        });

        // Add sharpening after upscaling to restore detail
        processedInstance = processedInstance.sharpen(1.0, 1.0, 2.0); // sigma, flat, jagged
      }
    }

    let processedImageBuffer: Buffer;
    let mimeType: string;

    if (isStandardResolution) {
      // Determine if image was upscaled for quality adjustment
      const wasUpscaled = validatedCrop.width < 320 || validatedCrop.height < 320;
      const quality = wasUpscaled ? 99 : 95; // Higher quality for upscaled images
      
      // For standard resolution, use higher quality settings
      processedImageBuffer = await processedInstance
        .jpeg({
          quality, // Optimized quality based on upscaling
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer();
      mimeType = 'image/jpeg';
    } else {
      // For high-resolution images, continue using WebP
      processedImageBuffer = await processedInstance
        .webp({
          quality: 90,
          effort: 2,
          lossless: false,
          nearLossless: false,
          smartSubsample: true,
        })
        .toBuffer();
      mimeType = 'image/webp';
    }

    // Convert to base64 data URL
    const base64 = processedImageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Server image processing failed:', error);
    return null;
  }
}

// Video thumbnail processing without cropping - preserves original aspect ratio
export async function getVideoThumbnailWebpUrlServer({
  thumbnailUrl,
}: {
  thumbnailUrl: string | null;
}) {
  if (!thumbnailUrl) return null;

  try {
    const response = await fetch(thumbnailUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Video-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    const imageBuffer = await response.arrayBuffer();

    const processedImageBuffer = await sharp(imageBuffer, {
      failOnError: false,
      density: 72,
      pages: 1,
    })
      .webp({
        quality: 90,
        effort: 2,
        lossless: false,
        nearLossless: false,
        smartSubsample: true,
      })
      .toBuffer();

    const base64 = processedImageBuffer.toString('base64');
    return `data:image/webp;base64,${base64}`;
  } catch (error) {
    console.error('Server video thumbnail processing failed:', error);
    return null;
  }
}

// Batch processing functions remain the same...
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailUrls: Array<string | null>
) {
  return Promise.all(
    thumbnailUrls.map((thumbnailUrl) =>
      getVideoThumbnailWebpUrlServer({ thumbnailUrl })
    )
  );
}

export async function getCroppedPlaylistImageUrlsBatch(
  requests: Array<{
    imageProperties: ImageProperties | null;
    thumbnailMaxResUrl: string | null;
    thumbnailUrl?: string | null;
  }>
) {
  return Promise.all(
    requests.map((request) => getCroppedPlaylistImageUrlServer(request))
  );
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
        // 320x180 medium: improved less aggressive cropping strategy
        // Use 280x180 crop (preserves more content) then upscale to square
        scaledProperties = {
          x: Math.round((320 - 280) / 2), // 20px from left (vs 70px before)
          y: 0,
          width: 280, // Preserve more width (vs 180 before)
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
