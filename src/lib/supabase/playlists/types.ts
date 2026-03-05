import type { Tables } from '../database.types';
import type { Database } from '../database.types';

export const USER_PLAYLIST_LIMIT = 25;
export const DEFAULT_NUM_PLAYLISTS_OVERVIEW = 6;
export const DEFAULT_NUM_PLAYLISTS_PAGINATION = 15;
export const PLAYLIST_VIDEO_LIMIT = 100;

// Infer types from Supabase RPC functions
type GetPlaylistDataResponse =
  Database['public']['Functions']['get_playlist_data']['Returns'][0];
type GetUserPlaylistsResponse =
  Database['public']['Functions']['get_user_playlists']['Returns'][0];
type GetPlaylistVideoContextResponse =
  Database['public']['Functions']['get_playlist_video_context']['Returns'][0];

// Map RPC response fields to client-friendly names
export type Playlist = {
  id: GetPlaylistDataResponse['playlist_id'];
  created_at: GetPlaylistDataResponse['playlist_created_at'];
  name: GetPlaylistDataResponse['playlist_name'];
  short_id: GetPlaylistDataResponse['playlist_short_id'];
  created_by: GetPlaylistDataResponse['playlist_created_by'] | null;
  description: GetPlaylistDataResponse['playlist_description'];
  image_url: GetPlaylistDataResponse['playlist_image_url'] | null;
  image_processing_status: GetPlaylistDataResponse['playlist_image_processing_status'];
  type: GetPlaylistDataResponse['playlist_type'];
  image_properties: GetPlaylistDataResponse['playlist_image_properties'] | null;
  youtube_id: GetPlaylistDataResponse['playlist_youtube_id'] | null;
  thumbnail_url: GetPlaylistDataResponse['playlist_thumbnail_url'] | null;
  deleted_at: GetPlaylistDataResponse['playlist_deleted_at'] | null;
  duration_seconds: GetPlaylistDataResponse['total_duration_seconds'];
  updated_at?: string | null;
  image_processing_updated_at?: string | null;
  profile_username: GetPlaylistDataResponse['profile_username'];
  profile_avatar_url?: GetPlaylistDataResponse['profile_avatar_url'];
};

// export type ProfilePlaylist = Playlist & {
//   profile_username: GetPlaylistDataResponse['profile_username'];
//   profile_avatar_url?: GetPlaylistDataResponse['profile_avatar_url'];
// };

export type UserPlaylist = Playlist & {
  playlist_position: GetUserPlaylistsResponse['playlist_position'];
  sorted_by: GetUserPlaylistsResponse['sorted_by'];
  sort_order: GetUserPlaylistsResponse['sort_order'];
  added_at?: GetUserPlaylistsResponse['added_at'];
};

// Video types from RPC response
export type PlaylistVideoWithTimestamp = {
  id: GetPlaylistDataResponse['video_id'];
  video_position: GetPlaylistDataResponse['video_position'];
  source: GetPlaylistDataResponse['video_source'];
  title: GetPlaylistDataResponse['video_title'];
  description: GetPlaylistDataResponse['video_description'];
  thumbnail_url: GetPlaylistDataResponse['video_thumbnail_url'];
  image_url: GetPlaylistDataResponse['video_image_url'] | null;
  published_at: GetPlaylistDataResponse['video_published_at'];
  duration: GetPlaylistDataResponse['video_duration'];
  video_start_seconds: GetPlaylistDataResponse['video_start_seconds'] | null;
  updated_at: GetPlaylistDataResponse['video_updated_at'] | null;
  watched_at: GetPlaylistDataResponse['video_watched_at'] | null;
  views: number;
};

export type PlaylistVideo = Tables<'playlist_videos'>;
export const PLAYLIST_TYPES = ['Public', 'Private'] as const;
export type PlaylistType = (typeof PLAYLIST_TYPES)[number];

export interface PlaylistImageProperties {
  x: number;
  y: number;
  height: number;
  width: number;
}

// Export RPC response types for internal use
export type {
  GetPlaylistDataResponse,
  GetUserPlaylistsResponse,
  GetPlaylistVideoContextResponse,
};
