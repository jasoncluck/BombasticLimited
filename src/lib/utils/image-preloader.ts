/**
 * Image preloading utility for optimizing image loading performance
 * Supports both browser preloading and service worker caching strategies
 */

// Supported image domains for security validation
const ALLOWED_IMAGE_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com', 
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com', 
  'i4.ytimg.com',
  'static-cdn.jtvnw.net'
];

export interface ImagePreloadOptions {
  priority?: 'high' | 'low' | 'auto';
  as?: 'image';
  type?: string;
  crossorigin?: 'anonymous' | 'use-credentials';
}

export interface IntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
}

/**
 * Validate if an image URL is from an allowed domain
 */
export function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_IMAGE_DOMAINS.includes(parsedUrl.hostname) || 
           parsedUrl.hostname.includes('.supabase.co');
  } catch {
    return false;
  }
}

/**
 * Preload an image using browser's link preloading
 */
export function preloadImageWithLink(
  url: string, 
  options: ImagePreloadOptions = {}
): void {
  if (!isValidImageUrl(url)) return;
  
  // Check if already preloaded
  const existingLink = document.querySelector(`link[href="${url}"]`);
  if (existingLink) return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = options.as || 'image';
  link.href = url;
  
  if (options.type) link.type = options.type;
  if (options.crossorigin) link.crossOrigin = options.crossorigin;
  if (options.priority) {
    // Use fetchpriority for supporting browsers
    (link as any).fetchPriority = options.priority;
  }
  
  document.head.appendChild(link);
}

/**
 * Preload an image using service worker caching
 */
export async function preloadImageWithServiceWorker(url: string): Promise<void> {
  if (!isValidImageUrl(url)) return;
  
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PRELOAD_IMAGE',
        url
      });
    }
  } catch (error) {
    console.debug('Service worker image preload failed:', error);
  }
}

/**
 * Preload multiple images using both strategies
 */
export async function preloadImages(
  urls: string[], 
  options: ImagePreloadOptions = {}
): Promise<void> {
  const validUrls = urls.filter(isValidImageUrl);
  
  // Use browser preloading for immediate priority
  validUrls.forEach(url => preloadImageWithLink(url, options));
  
  // Use service worker for caching
  await Promise.allSettled(
    validUrls.map(url => preloadImageWithServiceWorker(url))
  );
}

/**
 * Create an intersection observer for detecting above-the-fold images
 */
export function createImageIntersectionObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options: IntersectionObserverOptions = {}
): IntersectionObserver | null {
  if (!('IntersectionObserver' in window)) return null;
  
  return new IntersectionObserver(callback, {
    threshold: options.threshold || 0.1,
    rootMargin: options.rootMargin || '50px'
  });
}

/**
 * Determine if an element is likely above the fold
 */
export function isLikelyAboveTheFold(element: HTMLElement): boolean {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  
  // Consider above the fold if top is within the first viewport
  return rect.top < viewportHeight && rect.bottom > 0;
}

/**
 * Get optimal loading attribute based on position
 */
export function getOptimalLoadingAttribute(
  element: HTMLElement | null, 
  index?: number
): 'eager' | 'lazy' {
  // First few images should always be eager
  if (index !== undefined && index < 3) return 'eager';
  
  // Check position if element is available
  if (element && isLikelyAboveTheFold(element)) return 'eager';
  
  // Default to lazy for performance
  return 'lazy';
}

/**
 * Get optimal fetchpriority attribute based on position
 */
export function getOptimalFetchPriority(
  element: HTMLElement | null,
  index?: number
): 'high' | 'low' | 'auto' {
  // First image should be high priority
  if (index !== undefined && index === 0) return 'high';
  
  // First few images should be auto (browser decides)
  if (index !== undefined && index < 3) return 'auto';
  
  // Check position if element is available  
  if (element && isLikelyAboveTheFold(element)) return 'high';
  
  // Default to low for below-the-fold content
  return 'low';
}

/**
 * Extract image URLs from video objects for preloading
 */
export function extractImageUrls(videos: Array<{ image_url?: string | null; thumbnail_url?: string | null }>): string[] {
  return videos
    .map(video => video.image_url || video.thumbnail_url)
    .filter((url): url is string => Boolean(url))
    .filter(isValidImageUrl);
}