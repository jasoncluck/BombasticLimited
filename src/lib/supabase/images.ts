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

