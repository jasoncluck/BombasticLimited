import type { PlaylistImageProperties } from '$lib/supabase/playlists';

/**
 * Calculate dynamic crop dimensions for any image size and aspect ratio
 * This replaces hardcoded YouTube thumbnail size checks with intelligent cropping
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
    const adjustedY = Math.max(0, Math.min(customProperties.y, imageHeight - 1));
    const maxWidth = imageWidth - adjustedX;
    const maxHeight = imageHeight - adjustedY;
    
    return {
      x: adjustedX,
      y: adjustedY,
      width: Math.max(1, Math.min(customProperties.width, maxWidth)),
      height: Math.max(1, Math.min(customProperties.height, maxHeight)),
    };
  }

  if (preferSquareCrop) {
    // Create a square crop centered on the image
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
  } else if (aspectRatio < 0.75) {
    // Tall image - crop to more reasonable aspect ratio  
    cropWidth = imageWidth;
    cropHeight = Math.round(imageWidth / 0.75); // 4:3 aspect ratio
  } else {
    // Reasonable aspect ratio - use full image
    cropWidth = imageWidth;
    cropHeight = imageHeight;
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
 * This is the enhanced version of the current validateAndAdjustCropDimensions function
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

  if (imageType === 'standard') {
    // For standard images, prioritize dynamic crop calculation over provided properties
    // This ensures we get consistent square crops regardless of provided properties
    scaledProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop for standard images
      null // Ignore provided properties for standard images to ensure consistency
    );
  } else {
    // For maxres images, validate the provided properties
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