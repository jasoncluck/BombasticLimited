/**
 * Shared image format detection utilities
 * This file can be imported by both client and server code
 */

export const imageFormats = ['avif', 'webp', 'jpeg'] as const;
export type ImageFormat = (typeof imageFormats)[number];

/**
 * Browser format support detection based on Accept header
 * Enhanced to better prioritize WebP for optimal compression and compatibility
 */
export function detectOptimalFormat(acceptHeader?: string | null): ImageFormat {
  if (!acceptHeader) {
    // For external images (like YouTube) without Accept headers,
    // default to WebP for broader compatibility while still providing good compression
    return 'webp';
  }

  const accept = acceptHeader.toLowerCase();

  // Explicit AVIF support - best compression
  if (accept.includes('image/avif')) {
    return 'avif';
  }

  // Explicit WebP support - good compression and wide compatibility
  if (accept.includes('image/webp')) {
    return 'webp';
  }

  // Enhanced detection for modern browsers
  if (accept.includes('image/*') || accept.includes('*/*')) {
    // Check for quality preferences in Accept header
    const webpQuality = accept.match(/image\/webp;q=([0-9.]+)/);
    const jpegQuality = accept.match(/image\/jpeg;q=([0-9.]+)/);

    // If WebP has higher or equal quality preference, use it
    if (webpQuality && jpegQuality) {
      const webpQ = parseFloat(webpQuality[1]);
      const jpegQ = parseFloat(jpegQuality[1]);
      if (webpQ >= jpegQ) {
        return 'webp';
      }
    }

    // Default to WebP for modern browsers for better compression
    return 'webp';
  }

  // Fallback to JPEG for maximum compatibility
  return 'jpeg';
}

/**
 * Client-side browser support detection using feature detection
 * This can be used in browser environments when Accept headers aren't available
 */
export function detectBrowserImageSupport(): Promise<{
  avif: boolean;
  webp: boolean;
}> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    const checkSupport = {
      avif: false,
      webp: false,
    };

    let pendingChecks = 2;
    const checkComplete = () => {
      pendingChecks--;
      if (pendingChecks === 0) {
        resolve(checkSupport);
      }
    };

    // Check AVIF support
    canvas.toBlob((blob) => {
      checkSupport.avif = blob !== null;
      checkComplete();
    }, 'image/avif');

    // Check WebP support
    canvas.toBlob((blob) => {
      checkSupport.webp = blob !== null;
      checkComplete();
    }, 'image/webp');
  });
}
