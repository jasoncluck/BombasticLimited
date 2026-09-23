import type { Video } from '../videos';
import type { Json } from '../database.types';
import type {
  Playlist,
  UserPlaylist,
  PlaylistVideo,
  PlaylistImageProperties,
} from './types';

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
    (typeof obj.created_by === 'string' || obj.created_at === null) &&
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
    (typeof obj.created_by === 'string' || obj.created_by === null) &&
    (typeof obj.description === 'string' || obj.description === null) &&
    'image_properties' in obj &&
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    typeof obj.type === 'string'
  );
}
