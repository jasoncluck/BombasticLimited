import { browser } from '$app/environment';

/**
 * Detect optimal image format based on Accept header (server) or browser capabilities (client)
 */
export function detectOptimalImageFormat(
  acceptHeader?: string | null
): 'avif' | 'webp' | 'jpeg' {
  // Server-side: Parse Accept header

  if (!browser && acceptHeader) {
    return parseAcceptHeader(acceptHeader);
  }

  // Server-side fallback: Prefer modern formats
  if (!browser) {
    return 'webp'; // Default to WebP for server-side
  }

  // Client-side: Use cached result or detect
  return detectClientImageFormat();
}

/**
 * Parse HTTP Accept header to determine best supported format
 */
function parseAcceptHeader(acceptHeader: string): 'avif' | 'webp' | 'jpeg' {
  const header = acceptHeader.toLowerCase();

  // Check for AVIF support first
  if (header.includes('image/avif')) {
    return 'avif';
  }

  // Check for WebP support
  if (header.includes('image/webp')) {
    return 'webp';
  }

  // Fallback to JPEG
  return 'jpeg';
}

/**
 * Client-side format detection with caching
 */
let cachedFormat: 'avif' | 'webp' | 'jpeg' | null = null;

function detectClientImageFormat(): 'avif' | 'webp' | 'jpeg' {
  // Return cached result if available
  if (cachedFormat) {
    return cachedFormat;
  }

  // Test actual image loading support
  cachedFormat = testImageFormatSupport();
  return cachedFormat;
}

/**
 * Test actual image format support by trying to load test images
 */
function testImageFormatSupport(): 'avif' | 'webp' | 'jpeg' {
  // Modern browsers that support AVIF
  if (supportsAVIF()) {
    return 'avif';
  }

  // Browsers that support WebP (most modern browsers)
  if (supportsWebP()) {
    return 'webp';
  }

  // Fallback to JPEG (universal support)
  return 'jpeg';
}

/**
 * Check AVIF support using feature detection
 */
function supportsAVIF(): boolean {
  try {
    // Check if we can create an AVIF image
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    // AVIF support detection
    return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
  } catch {
    return false;
  }
}

/**
 * Check WebP support using feature detection
 */
function supportsWebP(): boolean {
  try {
    // Check if we can create a WebP image
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    // WebP support detection
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    return false;
  }
}

/**
 * Get format priority for different content types
 */
export function getFormatPriority(
  contentType: 'playlist' | 'video'
): ('avif' | 'webp' | 'jpeg')[] {
  if (contentType === 'playlist') {
    // Playlists: AVIF -> WebP (no JPEG fallback since we control the processing)
    return ['avif', 'webp'];
  } else {
    // Videos: AVIF -> WebP -> JPEG (full fallback chain)
    return ['avif', 'webp', 'jpeg'];
  }
}

/**
 * Determine best format for a specific use case
 */
export function getBestImageFormat(
  contentType: 'playlist' | 'video',
  acceptHeader: string | null
): 'avif' | 'webp' | 'jpeg' {
  const detectedFormat = detectOptimalImageFormat(acceptHeader);
  const supportedFormats = getFormatPriority(contentType);

  // Return the detected format if it's supported for this content type
  if (supportedFormats.includes(detectedFormat)) {
    return detectedFormat;
  }

  // Fallback to the first supported format
  return supportedFormats[0];
}

/**
 * Get file extension for a format
 */
export function getFormatExtension(format: 'avif' | 'webp' | 'jpeg'): string {
  switch (format) {
    case 'avif':
      return '.avif';
    case 'webp':
      return '.webp';
    case 'jpeg':
      return '.jpg';
    default:
      return '.jpg';
  }
}

/**
 * Get MIME type for a format
 */
export function getFormatMimeType(format: 'avif' | 'webp' | 'jpeg'): string {
  switch (format) {
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'image/jpeg';
  }
}
