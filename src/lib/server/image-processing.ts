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

// Video thumbnail processing without cropping - preserves original aspect ratio
export async function getVideoThumbnailWebpUrlServer({
  thumbnailUrl,
}: {
  thumbnailUrl: string | null;
}) {
  if (!thumbnailUrl) return null;

  try {
    // Fetch image with optimized settings for speed
    const response = await fetch(thumbnailUrl, {
      signal: AbortSignal.timeout(8000), // Reduced timeout for faster processing
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Video-Service/1.0',
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.status}`);

    const imageBuffer = await response.arrayBuffer();

    // Process with Sharp but without cropping - preserve original aspect ratio
    const processedImageBuffer = await sharp(imageBuffer, {
      failOnError: false,
      density: 72, // Optimize for web display
      pages: 1, // Only process first frame for faster processing
    })
      .webp({
        quality: 90, // Increased quality for better visual appearance
        effort: 2, // Reduced effort for faster processing
        lossless: false,
        nearLossless: false,
        smartSubsample: true, // Better compression with minimal quality loss
      })
      .toBuffer();

    // Convert to base64 data URL
    const base64 = processedImageBuffer.toString('base64');
    return `data:image/webp;base64,${base64}`;
  } catch (error) {
    console.error('Server video thumbnail processing failed:', error);
    return null;
  }
}

// Batch processing function for multiple video thumbnails
export async function getVideoThumbnailWebpUrlsBatch(
  thumbnailUrls: Array<string | null>
) {
  // Process all images in parallel
  return Promise.all(
    thumbnailUrls.map((thumbnailUrl) =>
      getVideoThumbnailWebpUrlServer({ thumbnailUrl })
    )
  );
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
