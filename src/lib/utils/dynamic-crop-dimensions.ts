import type { PlaylistImageProperties } from '$lib/supabase/playlists';

/**
 * Calculate dynamic crop dimensions for any image size and aspect ratio
 * Enhanced to handle small thumbnails more conservatively
 */
export function calculateDynamicCropDimensions(
  imageWidth: number,
  imageHeight: number,
  preferSquareCrop: boolean = true,
  customProperties?: PlaylistImageProperties | null
): PlaylistImageProperties {
  // Validate image dimensions
  if (imageWidth <= 0 || imageHeight <= 0) {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, imageWidth),
      height: Math.max(1, imageHeight),
    };
  }

  // If custom properties are provided, validate and use them
  if (customProperties) {
    const adjustedX = Math.max(0, Math.min(customProperties.x, imageWidth - 1));
    const adjustedY = Math.max(
      0,
      Math.min(customProperties.y, imageHeight - 1)
    );
    const maxWidth = imageWidth - adjustedX;
    const maxHeight = imageHeight - adjustedY;

    return {
      x: adjustedX,
      y: adjustedY,
      width: Math.max(1, Math.min(customProperties.width, maxWidth)),
      height: Math.max(1, Math.min(customProperties.height, maxHeight)),
    };
  }

  // Determine if this is a small thumbnail that needs conservative cropping
  const imageArea = imageWidth * imageHeight;
  const isSmallThumbnail = imageArea <= 100000; // ~320x313 or smaller
  const isVerySmallThumbnail = imageArea <= 60000; // ~320x188 or smaller (like YouTube default)

  if (preferSquareCrop) {
    // For very small thumbnails, use minimal cropping to preserve content
    if (isVerySmallThumbnail) {
      // Use 85% of the smaller dimension to avoid over-cropping
      const cropSize = Math.min(imageWidth, imageHeight) * 0.85;
      return {
        x: Math.round((imageWidth - cropSize) / 2),
        y: Math.round((imageHeight - cropSize) / 2),
        width: Math.round(cropSize),
        height: Math.round(cropSize),
      };
    }

    // For small thumbnails, use 90% of the smaller dimension
    if (isSmallThumbnail) {
      const cropSize = Math.min(imageWidth, imageHeight) * 0.9;
      return {
        x: Math.round((imageWidth - cropSize) / 2),
        y: Math.round((imageHeight - cropSize) / 2),
        width: Math.round(cropSize),
        height: Math.round(cropSize),
      };
    }

    // For larger images, use the full smaller dimension (original behavior)
    const cropSize = Math.min(imageWidth, imageHeight);
    return {
      x: Math.round((imageWidth - cropSize) / 2),
      y: Math.round((imageHeight - cropSize) / 2),
      width: cropSize,
      height: cropSize,
    };
  }

  // For non-square crops, maintain aspect ratio but crop to reasonable size
  const aspectRatio = imageWidth / imageHeight;
  let cropWidth: number;
  let cropHeight: number;

  if (aspectRatio > 1.5) {
    // Wide image - crop to more reasonable aspect ratio
    cropHeight = imageHeight;
    cropWidth = Math.round(imageHeight * 1.5); // 3:2 aspect ratio

    // For small images, reduce cropping intensity
    if (isSmallThumbnail) {
      cropWidth = Math.min(cropWidth, imageWidth * 0.9);
    }
  } else if (aspectRatio < 0.75) {
    // Tall image - crop to more reasonable aspect ratio
    cropWidth = imageWidth;
    cropHeight = Math.round(imageWidth / 0.75); // 4:3 aspect ratio

    // For small images, reduce cropping intensity
    if (isSmallThumbnail) {
      cropHeight = Math.min(cropHeight, imageHeight * 0.9);
    }
  } else {
    // Reasonable aspect ratio - use full image for small thumbnails
    if (isSmallThumbnail) {
      cropWidth = imageWidth;
      cropHeight = imageHeight;
    } else {
      cropWidth = imageWidth;
      cropHeight = imageHeight;
    }
  }

  return {
    x: Math.round((imageWidth - cropWidth) / 2),
    y: Math.round((imageHeight - cropHeight) / 2),
    width: Math.min(cropWidth, imageWidth),
    height: Math.min(cropHeight, imageHeight),
  };
}

/**
 * Validate and adjust crop dimensions to ensure they are within image bounds
 * Enhanced with size-aware validation
 */
export function validateAndAdjustCropDimensions(
  imageProperties: PlaylistImageProperties,
  imageWidth: number,
  imageHeight: number,
  imageType: 'maxres' | 'standard'
): PlaylistImageProperties {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return {
      x: Math.max(0, imageProperties.x),
      y: Math.max(0, imageProperties.y),
      width: Math.max(1, imageProperties.width),
      height: Math.max(1, imageProperties.height),
    };
  }

  let scaledProperties = { ...imageProperties };

  // Determine if this is a small image that needs special handling
  const imageArea = imageWidth * imageHeight;
  const isSmallImage = imageArea <= 100000;

  if (imageType === 'standard' || isSmallImage) {
    // For standard images or small images, prioritize conservative dynamic crop calculation
    // This ensures we get consistent crops without over-zooming on small thumbnails
    scaledProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop
      isSmallImage ? null : imageProperties // Ignore provided properties for small images to prevent over-cropping
    );
  } else {
    // For maxres images (larger), validate the provided properties
    scaledProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true,
      imageProperties // Custom properties for maxres images
    );
  }

  // Final bounds validation
  const adjustedX = Math.max(0, Math.min(scaledProperties.x, imageWidth - 1));
  const adjustedY = Math.max(0, Math.min(scaledProperties.y, imageHeight - 1));
  const maxWidth = imageWidth - adjustedX;
  const maxHeight = imageHeight - adjustedY;

  return {
    x: adjustedX,
    y: adjustedY,
    width: Math.max(1, Math.min(scaledProperties.width, maxWidth)),
    height: Math.max(1, Math.min(scaledProperties.height, maxHeight)),
  };
}
