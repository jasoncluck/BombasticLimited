import type { ImageProperties } from '$lib/components/playlist/playlist';
import {
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
  PLAYLIST_IMAGE_CROP_DEFAULTS,
} from '$lib/components/playlist/playlist-service';
import sharp from 'sharp';

export async function getCroppedPlaylistImageUrlServer({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
}: {
  imageProperties: ImageProperties | null;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl?: string | null;
}) {
  const imageUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!imageUrl) return null;

  if (!imageProperties) {
    imageProperties = thumbnailMaxResUrl
      ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
      : PLAYLIST_IMAGE_CROP_DEFAULTS;
  }

  try {
    // Fetch image with optimized settings
    const response = await fetch(imageUrl, {
      // Add timeout and headers for better performance
      signal: AbortSignal.timeout(10000), // 10 second timeout
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Playlist-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    // Use response.arrayBuffer() directly without intermediate conversion
    const imageBuffer = await response.arrayBuffer();

    // Optimize Sharp processing with pipeline approach
    const processedImageBuffer = await sharp(imageBuffer, {
      // Sharp optimization options
      failOnError: false,
      density: 72, // Optimize for web display
    })
      .extract({
        left: Math.max(0, imageProperties.x),
        top: Math.max(0, imageProperties.y),
        width: Math.max(1, imageProperties.width),
        height: Math.max(1, imageProperties.height),
      })
      .webp({
        quality: 80,
        effort: 4, // Good balance between compression and processing time
      })
      .toBuffer();

    // Convert to base64 data URL
    const base64 = processedImageBuffer.toString('base64');
    return `data:image/webp;base64,${base64}`;
  } catch (error) {
    console.error('Server image processing failed:', error);
    return null;
  }
}

// Optional: Batch processing function for multiple images
export async function getCroppedPlaylistImageUrlsBatch(
  requests: Array<{
    imageProperties: ImageProperties | null;
    thumbnailMaxResUrl: string | null;
    thumbnailUrl?: string | null;
  }>
) {
  // Process all images in parallel
  return Promise.all(
    requests.map((request) => getCroppedPlaylistImageUrlServer(request))
  );
}
