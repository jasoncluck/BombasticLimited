/**
 * Shared image format detection utilities
 * This file can be imported by both client and server code
 */

/**
 * Browser format support detection based on Accept header
 */
export function detectOptimalFormat(acceptHeader?: string | null): 'avif' | 'webp' | 'jpeg' {
  if (!acceptHeader) {
    // For external images (like YouTube) without Accept headers, 
    // default to WebP for broader compatibility while still providing good compression
    return 'webp';
  }
  
  const accept = acceptHeader.toLowerCase();
  
  // Explicit AVIF support
  if (accept.includes('image/avif')) {
    return 'avif';
  }
  
  // Explicit WebP support
  if (accept.includes('image/webp')) {
    return 'webp';
  }
  
  // For modern browsers that accept all image types but don't explicitly list AVIF/WebP
  // We should try AVIF first for supporting browsers, but fallback to WebP for better compatibility
  if (accept.includes('image/*') || accept.includes('*/*')) {
    // Since we can't be certain about AVIF support with generic headers,
    // use WebP as a safer default that still provides good compression
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

/**
 * Get optimal format based on browser support (client-side)
 */
export async function getOptimalFormatForBrowser(): Promise<'avif' | 'webp' | 'jpeg'> {
  try {
    const support = await detectBrowserImageSupport();
    
    if (support.avif) {
      return 'avif';
    }
    
    if (support.webp) {
      return 'webp';
    }
    
    return 'jpeg';
  } catch {
    // Fallback to WebP on any error
    return 'webp';
  }
}