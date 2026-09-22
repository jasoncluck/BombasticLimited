import type { Source } from '$lib/constants/source';
import { PUBLIC_CONTENT_IMAGES_URL } from '$env/static/public';
import type {
  Playlist,
  UserPlaylist,
  PlaylistVideoWithTimestamp,
  GetPlaylistDataResponse,
  GetUserPlaylistsResponse,
  GetPlaylistVideoContextResponse,
} from './types';

/**
 * Convert an S3 key to a full public URL. Video thumbnails pass through
 * their raw external YouTube URL here too (image_url == thumbnail_url for
 * videos, since only playlist thumbnails go through the S3
 * crop/resize/WebP-AVIF pipeline) — already-absolute URLs are returned
 * unchanged instead of being prefixed with the S3 bucket URL.
 */
export function getFullImageUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  return `${PUBLIC_CONTENT_IMAGES_URL}/${storagePath}`;
}

/**
 * Transform RPC response to client-friendly Playlist type
 */
export function transformPlaylistFromRPC(
  rpcData: GetPlaylistDataResponse
): Playlist {
  return {
    id: rpcData.playlist_id,
    created_at: rpcData.playlist_created_at,
    name: rpcData.playlist_name,
    short_id: rpcData.playlist_short_id,
    created_by: rpcData.playlist_created_by,
    description: rpcData.playlist_description,
    image_url: getFullImageUrl(rpcData.playlist_image_url),
    image_processing_status: rpcData.playlist_image_processing_status,
    type: rpcData.playlist_type,
    image_properties: rpcData.playlist_image_properties,
    youtube_id: rpcData.playlist_youtube_id,
    thumbnail_url: rpcData.playlist_thumbnail_url,
    deleted_at: rpcData.playlist_deleted_at,
    duration_seconds: rpcData.total_duration_seconds,
    profile_username: rpcData.profile_username,
    profile_avatar_url: rpcData.profile_avatar_url,
    // Optional fields that aren't returned by get_playlist_data RPC
    updated_at: null,
    image_processing_updated_at: null,
  };
}

/**
 * Transform RPC response to UserPlaylist type
 */
export function transformUserPlaylistFromRPC(
  rpcData: GetUserPlaylistsResponse
): UserPlaylist {
  return {
    id: rpcData.id,
    created_at: rpcData.created_at,
    name: rpcData.name,
    short_id: rpcData.short_id,
    created_by: rpcData.created_by,
    description: rpcData.description,
    image_url: getFullImageUrl(rpcData.image_url),
    image_processing_status: rpcData.image_processing_status,
    type: rpcData.type,
    image_properties: rpcData.image_properties,
    youtube_id: rpcData.youtube_id,
    thumbnail_url: rpcData.playlist_thumbnail_url,
    deleted_at: rpcData.deleted_at,
    duration_seconds: rpcData.duration_seconds,
    profile_username: rpcData.profile_username,
    profile_avatar_url: rpcData.profile_avatar_url,
    playlist_position: rpcData.playlist_position,
    sorted_by: rpcData.sorted_by,
    sort_order: rpcData.sort_order,
    added_at: rpcData.added_at,
  };
}

/**
 * Transform RPC response to PlaylistVideoWithTimestamp type
 */
export function transformVideoFromRPC(
  rpcData: GetPlaylistDataResponse
): PlaylistVideoWithTimestamp {
  return {
    id: rpcData.video_id,
    video_position: rpcData.video_position,
    source: rpcData.video_source as Source,
    title: rpcData.video_title,
    description: rpcData.video_description,
    thumbnail_url: rpcData.video_thumbnail_url,
    image_url: rpcData.video_image_url
      ? getFullImageUrl(rpcData.video_image_url)
      : rpcData.video_thumbnail_url,
    published_at: rpcData.video_published_at,
    duration: rpcData.video_duration,
    video_start_seconds: rpcData.video_start_seconds,
    updated_at: rpcData.video_updated_at,
    watched_at: rpcData.video_watched_at,
    views: 0,
  };
}

/**
 * Transform context RPC response to PlaylistVideoWithTimestamp type
 */
export function transformVideoFromContextRPC(
  rpcData: GetPlaylistVideoContextResponse
): PlaylistVideoWithTimestamp {
  return {
    id: rpcData.video_id,
    video_position: rpcData.video_position,
    source: rpcData.video_source as Source,
    title: rpcData.video_title,
    description: rpcData.video_description,
    thumbnail_url: rpcData.video_thumbnail_url,
    image_url: getFullImageUrl(rpcData.video_image_url),
    published_at: rpcData.video_published_at,
    duration: rpcData.video_duration,
    video_start_seconds: rpcData.video_start_seconds,
    updated_at: rpcData.video_updated_at,
    watched_at: rpcData.video_watched_at,
    // Add missing Video properties with defaults
    views: 0,
  };
}
