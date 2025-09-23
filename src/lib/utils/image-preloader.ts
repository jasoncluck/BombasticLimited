/**
 * Image preloader utility for SvelteKit pages
 * Provides Promise-based image loading with loading state management
 */

export interface PreloadResult {
  success: boolean;
  failed: string[];
}

/**
 * Preloads a single image and returns a Promise
 */
export function preloadImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));

    img.src = src;
  });
}

/**
 * Preloads multiple images and returns when all are loaded
 * @param urls Array of image URLs to preload
 * @param timeout Optional timeout in milliseconds (default: 10000)
 * @returns Promise that resolves with success status and failed URLs
 */
export async function preloadImages(
  urls: string[],
  timeout: number = 10000
): Promise<PreloadResult> {
  if (!urls.length) {
    return { success: true, failed: [] };
  }

  const results = await Promise.allSettled(
    urls.map((url) =>
      Promise.race([
        preloadImage(url),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout loading: ${url}`)),
            timeout
          )
        ),
      ])
    )
  );

  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failed.push(urls[index]);
    }
  });

  return {
    success: failed.length === 0,
    failed,
  };
}

/**
 * Extracts image URLs from video objects
 * Prioritizes image_url over thumbnail_url
 */
export function extractImageUrls(
  videos: Array<{ image_url?: string | null; thumbnail_url?: string | null }>
): string[] {
  return videos
    .map((video) => video.image_url || video.thumbnail_url)
    .filter((url): url is string => Boolean(url));
}

/**
 * Extracts image URLs from playlist objects
 */
export function extractPlaylistImageUrls(
  playlists: Array<{ image_url?: string | null }>
): string[] {
  return playlists
    .map((playlist) => playlist.image_url)
    .filter((url): url is string => Boolean(url));
}
