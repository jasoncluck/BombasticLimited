import type { ImageProperties } from "$lib/components/playlist/playlist";
import {
  PLAYLIST_IMAGE_CROP_DEFAULTS,
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
} from "$lib/components/playlist/playlist-service";

/**
 * Generate a Vercel-optimized image URL with cropping simulation
 */
function createVercelImageUrl(
  imageUrl: string,
  imageProperties: ImageProperties,
  quality: number = 80,
): string {
  const params = new URLSearchParams({
    url: imageUrl,
    w: imageProperties.width.toString(),
    h: imageProperties.height.toString(),
    q: quality.toString(),
    fit: "cover", // This will crop to fit the dimensions
  });

  return `/_vercel/image?${params.toString()}`;
}

/**
 * For more precise cropping, we need to handle it server-side
 * This creates a proxy endpoint that handles the cropping
 */
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
    // For simple resizing without precise cropping, use Vercel directly
    if (imageProperties.x === 0 && imageProperties.y === 0) {
      return createVercelImageUrl(imageUrl, imageProperties);
    }

    // For precise cropping, use our crop endpoint
    const cropParams = new URLSearchParams({
      url: imageUrl,
      x: imageProperties.x.toString(),
      y: imageProperties.y.toString(),
      width: imageProperties.width.toString(),
      height: imageProperties.height.toString(),
      quality: "80",
    });

    return `/api/image/crop?${cropParams.toString()}`;
  } catch (error) {
    console.error("Server image processing failed:", error);
    return null;
  }
}

export async function getCroppedPlaylistImageUrlsBatch(
  requests: Array<{
    imageProperties: ImageProperties | null;
    thumbnailMaxResUrl: string | null;
    thumbnailUrl?: string | null;
  }>,
) {
  // Process all images in parallel
  return Promise.all(
    requests.map((request) => getCroppedPlaylistImageUrlServer(request)),
  );
}
