import { browser } from '$app/environment';
import type { Video } from '../videos';
import type { Json } from '../database.types';
import type {
  Playlist,
  UserPlaylist,
  PlaylistVideo,
  PlaylistImageProperties,
} from './types';

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

/**
 * Get the best image URL from playlist data based on browser support
 */
export function getBestPlaylistImageUrl(
  playlist: {
    image_avif_url: string | null;
    image_webp_url: string | null;
    image_url: string | null;
  },
  acceptHeader: string | null
): string | null {
  const preferredFormat = detectOptimalImageFormat(acceptHeader);

  // Try to return the best format first
  switch (preferredFormat) {
    case 'avif':
      if (playlist.image_avif_url) return playlist.image_avif_url;
      if (playlist.image_webp_url) return playlist.image_webp_url;
      return playlist.image_url;
    case 'webp':
      if (playlist.image_webp_url) return playlist.image_webp_url;
      if (playlist.image_avif_url) return playlist.image_avif_url;
      return playlist.image_url;
    default:
      return (
        playlist.image_url || playlist.image_webp_url || playlist.image_avif_url
      );
  }
}

/**
 * Helper function to map contentFilter sort keys to database column names
 */
export function getSortField(sortKey: string): string | null {
  switch (sortKey) {
    case 'video_position':
    case 'playlistOrder':
      return 'video_position';
    case 'published_at':
    case 'datePublished':
      return 'video_published_at';
    case 'title':
      return 'video_title';
    case 'duration':
      return 'video_duration';
    default:
      return 'video_position'; // Default fallback
  }
}

/**
 * Parse image properties from JSON
 */
export function parseImageProperties(
  jsonb: Json
): PlaylistImageProperties | null {
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
      return obj as PlaylistImageProperties;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a video is a playlist video
 */
export function isPlaylistVideo(video: Video): video is Video & PlaylistVideo {
  return !!video && 'video_position' in video;
}

/**
 * Helper for checking plain objects
 */
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Type guard for Playlist
 */
export function isPlaylist(obj: unknown): obj is Playlist {
  return (
    isRecord(obj) &&
    typeof obj.id === 'number' &&
    typeof obj.created_at === 'string' &&
    typeof obj.created_by === 'string' &&
    (typeof obj.description === 'string' || obj.description === null) &&
    'image_properties' in obj &&
    typeof obj.name === 'string' &&
    typeof obj.short_id === 'string' &&
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    typeof obj.type === 'string' &&
    (typeof obj.youtube_id === 'string' || obj.youtube_id === null)
  );
}

/**
 * Type guard for UserPlaylist
 */
export function isUserPlaylist(obj: unknown): obj is UserPlaylist {
  return (
    isRecord(obj) &&
    typeof obj.id === 'number' &&
    (typeof obj.playlist_position === 'number' ||
      obj.playlist_position === null) &&
    typeof obj.sorted_by === 'string' &&
    typeof obj.sort_order === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.short_id === 'string' &&
    typeof obj.created_at === 'string' &&
    typeof obj.created_by === 'string' &&
    (typeof obj.description === 'string' || obj.description === null) &&
    'image_properties' in obj &&
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    typeof obj.type === 'string' &&
    (typeof obj.youtube_id === 'string' || obj.youtube_id === null)
  );
}
