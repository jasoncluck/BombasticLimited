import { goto } from "$app/navigation";
import type { Json } from "$lib/supabase/database.types";
import { type Playlist, isUserPlaylist } from "$lib/supabase/playlists";
import { type CombinedContentFilter, getSortKeysForView, isPlaylistVideosFilter, isSortKey, isSortOrder } from "../content/content-filter";

export interface ImageProperties extends Record<string, Json> {
  x: number;
  y: number;
  height: number;
  width: number;
}

export function handlePlaylistNavigation({
  playlist,
  contentFilter,
}: {
  playlist: Playlist;
  contentFilter?: CombinedContentFilter;
}) {
  const url = new URL(window.location.href);
  const searchParams = url.searchParams;

  // Build the base URL path
  const targetPath = `/playlist/${playlist.short_id}`;

  // Clear existing playlist sorting parameters
  getSortKeysForView("playlist").forEach((key) => {
    searchParams.delete(key);
  });

  // First check if there's an active content filter for playlist videos
  if (contentFilter && isPlaylistVideosFilter(contentFilter)) {
    searchParams.set(contentFilter.sort.key, contentFilter.sort.order);
  }
  // Check if the playlist has stored sort settings
  else if (isUserPlaylist(playlist)) {
    if (
      isSortKey(playlist.sorted_by, "playlist") &&
      isSortOrder(playlist.sort_order)
    ) {
      searchParams.set(playlist.sorted_by, playlist.sort_order);
    }
  }

  // Navigate to the playlist page with updated search parameters
  const targetUrl = `${targetPath}?${searchParams.toString()}`;
  goto(targetUrl);
}


export function parseImageProperties(jsonb: Json): ImageProperties | null {
  if (!jsonb) return null;

  try {
    // Handle if it's already an object
    const obj = typeof jsonb === 'string' ? JSON.parse(jsonb) : jsonb;

    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj.x === 'number' &&
      typeof obj.y === 'number' &&
      typeof obj.height === 'number' &&
      typeof obj.width === 'number'
    ) {
      return obj as ImageProperties;
    }

    return null;
  } catch {
    return null;
  }
}

export function serializeImageProperties(props: ImageProperties | null): Json {
  return props;
}

import {
  PLAYLIST_IMAGE_CROP_DEFAULTS,
  PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS,
} from "$lib/components/playlist/playlist-service";


// Functions for getting cropped playlist images in the browser for use when deferring image rendering
export async function getCroppedPlaylistImageUrl({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
}: {
  imageProperties: ImageProperties | null;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl?: string | null;
}): Promise<string | null> {
  const imageUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!imageUrl) return null;

  if (!imageProperties) {
    imageProperties = thumbnailMaxResUrl
      ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
      : PLAYLIST_IMAGE_CROP_DEFAULTS;
  }

  try {
    // Try OffscreenCanvas first (more efficient)
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      return await processWithOffscreenCanvas(imageUrl, imageProperties);
    } else {
      // Fallback to regular Canvas
      return await processWithCanvas(imageUrl, imageProperties);
    }
  } catch (error) {
    console.error("Browser image processing failed:", error);
    return null;
  }
}

async function processWithOffscreenCanvas(
  imageUrl: string,
  imageProperties: ImageProperties
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Failed to fetch image");

  const imageBlob = await response.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  const canvas = new OffscreenCanvas(imageProperties.width, imageProperties.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.drawImage(
    imageBitmap,
    imageProperties.x, imageProperties.y, imageProperties.width, imageProperties.height,
    0, 0, imageProperties.width, imageProperties.height
  );

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  return `data:image/jpeg;base64,${base64}`;
}

async function processWithCanvas(
  imageUrl: string,
  imageProperties: ImageProperties
): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Failed to get canvas context");

  canvas.width = imageProperties.width;
  canvas.height = imageProperties.height;

  ctx.drawImage(
    img,
    imageProperties.x, imageProperties.y, imageProperties.width, imageProperties.height,
    0, 0, imageProperties.width, imageProperties.height
  );

  return canvas.toDataURL('image/jpeg', 0.8);
}
