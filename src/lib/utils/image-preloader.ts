/**
 * Image preloading utility for optimizing image loading performance
 * Supports both browser preloading and service worker caching strategies
 */

import { simpleCache } from './simple-memory-cache';

// Supported image domains for security validation
const ALLOWED_IMAGE_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'static-cdn.jtvnw.net',
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
    return (
      ALLOWED_IMAGE_DOMAINS.includes(parsedUrl.hostname) ||
      parsedUrl.hostname.includes('.supabase.co')
    );
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
    (link as unknown as { fetchPriority: string }).fetchPriority =
      options.priority;
  }

  document.head.appendChild(link);
}

/**
 * Preload an image using service worker caching (throttled)
 */
export async function preloadImageWithServiceWorker(
  url: string
): Promise<void> {
  if (!isValidImageUrl(url)) return;

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Throttle individual preload requests to avoid spam
      navigator.serviceWorker.controller.postMessage({
        type: 'PRELOAD_IMAGE',
        url,
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
  validUrls.forEach((url) => preloadImageWithLink(url, options));

  // Use service worker for batch caching to reduce message spam
  if (validUrls.length > 0) {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'PRELOAD_IMAGES',
          urls: validUrls,
        });
      }
    } catch (error) {
      console.debug('Service worker batch image preload failed:', error);
    }
  }
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
    rootMargin: options.rootMargin || '50px',
  });
}

/**
 * Determine if an element is likely above the fold
 * Uses contentViewportRef if provided, falls back to window viewport
 */
export function isLikelyAboveTheFold(
  element: HTMLElement,
  contentViewportRef?: HTMLElement | null
): boolean {
  if (!element) return false;

  const rect = element.getBoundingClientRect();

  // Use contentViewportRef if available for more accurate detection
  if (contentViewportRef) {
    const viewportRect = contentViewportRef.getBoundingClientRect();
    const viewportHeight = viewportRect.height;
    const viewportTop = viewportRect.top;

    // Consider above the fold if element is within the content viewport
    return rect.top < viewportTop + viewportHeight && rect.bottom > viewportTop;
  }

  // Fallback to window viewport
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  return rect.top < viewportHeight && rect.bottom > 0;
}

/**
 * Get optimal loading attribute based on position
 */
export function getOptimalLoadingAttribute(
  element: HTMLElement | null,
  index?: number,
  contentViewportRef?: HTMLElement | null
): 'eager' | 'lazy' {
  // First few images should always be eager
  if (index !== undefined && index < 3) return 'eager';

  // Check position if element is available
  if (element && isLikelyAboveTheFold(element, contentViewportRef))
    return 'eager';

  // Default to lazy for performance
  return 'lazy';
}

/**
 * Get optimal fetchpriority attribute based on position
 */
export function getOptimalFetchPriority(
  element: HTMLElement | null,
  index?: number,
  contentViewportRef?: HTMLElement | null
): 'high' | 'low' | 'auto' {
  // First image should be high priority
  if (index !== undefined && index === 0) return 'high';

  // First few images should be auto (browser decides)
  if (index !== undefined && index < 3) return 'auto';

  // Check position if element is available
  if (element && isLikelyAboveTheFold(element, contentViewportRef))
    return 'high';

  // Default to low for below-the-fold content
  return 'low';
}

/**
 * Extract image URLs from video objects for preloading
 */
export function extractImageUrls(
  videos: Array<{ image_url?: string | null; thumbnail_url?: string | null }>
): string[] {
  return videos
    .map((video) => video.image_url || video.thumbnail_url)
    .filter((url): url is string => Boolean(url))
    .filter(isValidImageUrl);
}

/**
 * Preload an image and cache its URL in memory cache
 */
export async function preloadImageWithMemoryCache(url: string): Promise<void> {
  if (!isValidImageUrl(url)) return;

  // Check if already cached
  const cacheKey = `image_preload_${url}`;
  if (simpleCache.get(cacheKey)) return;

  try {
    // Cache the URL to prevent duplicate preloads
    simpleCache.set(cacheKey, true, 10 * 60 * 1000); // 10 minutes

    // Preload using both strategies
    preloadImageWithLink(url);
    await preloadImageWithServiceWorker(url);
  } catch (error) {
    console.debug('Image preload with memory cache failed:', error);
    // Remove from cache if preload failed
    simpleCache.delete(cacheKey);
  }
}

/**
 * Enhanced preload function that coordinates with hover behavior
 */
export async function preloadImagesOnHover(urls: string[]): Promise<void> {
  const validUrls = urls.filter(isValidImageUrl);

  // Use memory cache for hover preloading to prevent spam
  await Promise.all(validUrls.map((url) => preloadImageWithMemoryCache(url)));
}

/**
 * Optimize image loading for paginated content with viewport awareness
 * Uses contentViewportRef for more accurate above-the-fold detection
 */
export function optimizePageImageLoadingWithViewport(
  videos: Array<{ image_url?: string | null; thumbnail_url?: string | null }>,
  contentViewportRef: HTMLElement | null,
  imageOptions: {
    maxPreload?: number;
    priority?: 'high' | 'low' | 'auto';
  } = {}
): void {
  if (!videos?.length) return;

  const { maxPreload = 25, priority = 'auto' } = imageOptions;

  // If no contentViewportRef, fall back to simple slice approach
  if (!contentViewportRef) {
    const criticalVideos = videos.slice(0, maxPreload);
    const criticalImageUrls = extractImageUrls(criticalVideos);
    if (criticalImageUrls.length > 0) {
      preloadImages(criticalImageUrls, { priority });
    }
    return;
  }

  // Use contentViewportRef for accurate above-the-fold detection
  try {
    // Find video cards in the DOM - they are typically wrapped in content tiles
    const videoCards = contentViewportRef.querySelectorAll('[role="region"] > div');
    
    const videosToPreload: Array<{ image_url?: string | null; thumbnail_url?: string | null }> = [];
    const visibleVideos: Array<{ image_url?: string | null; thumbnail_url?: string | null }> = [];
    const belowFoldVideos: Array<{ image_url?: string | null; thumbnail_url?: string | null }> = [];
    
    // Categorize videos by viewport visibility
    videos.forEach((video, index) => {
      if (index < videoCards.length) {
        const cardElement = videoCards[index] as HTMLElement;
        if (isLikelyAboveTheFold(cardElement, contentViewportRef)) {
          visibleVideos.push(video);
        } else {
          belowFoldVideos.push(video);
        }
      } else {
        // If we have more videos than DOM elements, treat as below fold
        belowFoldVideos.push(video);
      }
    });

    // Prioritize visible videos first, then add below-fold videos up to maxPreload limit
    videosToPreload.push(...visibleVideos);
    const remainingSlots = maxPreload - visibleVideos.length;
    if (remainingSlots > 0) {
      videosToPreload.push(...belowFoldVideos.slice(0, remainingSlots));
    }

    const criticalImageUrls = extractImageUrls(videosToPreload);
    if (criticalImageUrls.length > 0) {
      preloadImages(criticalImageUrls, { priority });
    }
  } catch (error) {
    console.debug('Viewport-aware image preloading failed, falling back to simple approach:', error);
    // Fallback to simple approach if viewport detection fails
    const criticalVideos = videos.slice(0, maxPreload);
    const criticalImageUrls = extractImageUrls(criticalVideos);
    if (criticalImageUrls.length > 0) {
      preloadImages(criticalImageUrls, { priority });
    }
  }
}

/**
 * Optimize image loading for paginated content
 * Preloads only critical images to avoid performance issues
 */
export function optimizePageImageLoading(
  videos: Array<{ image_url?: string | null; thumbnail_url?: string | null }>,
  options: {
    maxPreload?: number;
    priority?: 'high' | 'low' | 'auto';
  } = {}
): void {
  if (!videos?.length) return;

  const { maxPreload = 25, priority = 'auto' } = options;

  // Only preload the first few critical images to avoid overwhelming the system
  const criticalVideos = videos.slice(0, maxPreload);
  const criticalImageUrls = extractImageUrls(criticalVideos);

  if (criticalImageUrls.length > 0) {
    preloadImages(criticalImageUrls, { priority });
  }
}
