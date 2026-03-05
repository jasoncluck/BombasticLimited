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

  if (preferSquareCrop) {
    // Create a square crop centered on the image
    let cropSize = Math.min(imageWidth, imageHeight);

    // Apply conservative cropping for small images to prevent over-cropping
    // Detect small YouTube thumbnails and similar sizes
    const isSmallImage = cropSize <= 180; // 320x180, 120x90, etc.

    if (isSmallImage) {
      // Use 85-90% of the smaller dimension to preserve more content
      // This prevents extreme zoom on small thumbnails
      const conservativeRatio = cropSize <= 90 ? 0.85 : 0.9; // More conservative for very small images
      cropSize = Math.round(cropSize * conservativeRatio);
    }

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
  imageType: 'maxres' | 'standard',
  originalCustomProperties?: PlaylistImageProperties | null
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

  // Check if we have actual custom properties (not just defaults)
  const hasCustomProperties =
    originalCustomProperties !== undefined && originalCustomProperties !== null;

  if (hasCustomProperties) {
    // Always use custom properties if provided, regardless of image type
    // This ensures user preferences are respected
    scaledProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true,
      originalCustomProperties // Use the provided custom properties
    );
  } else if (imageType === 'standard') {
    // Only fall back to dynamic cropping when no custom properties are set
    // Apply conservative cropping for small standard images
    scaledProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop for standard images
      null // No custom properties - use conservative dynamic cropping
    );
  } else {
    // For maxres images without custom properties, use defaults
    scaledProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true,
      imageProperties // Use provided default properties for maxres images
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
