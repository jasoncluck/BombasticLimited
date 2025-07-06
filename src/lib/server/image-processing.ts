import type { ImageProperties } from "$lib/components/playlist/playlist";
import {
  PLAYLIST_IMAGE_CROP_DEFAULTS,
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
} from "$lib/components/playlist/playlist-service";
import sharp from "sharp";

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
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to fetch image");

    const imageBuffer = await response.arrayBuffer();

    const processedImageBuffer = await sharp(Buffer.from(imageBuffer))
      .extract({
        left: imageProperties.x,
        top: imageProperties.y,
        width: imageProperties.width,
        height: imageProperties.height,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Convert to base64 data URL
    const base64 = processedImageBuffer.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error("Server image processing failed:", error);
    return null;
  }
}
