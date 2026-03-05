import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPlaylistData,
  getPlaylistDataByYoutubeId,
  getPlaylistsForUsername,
  getPlaylistByYoutubeId,
  getPlaylistVideoContext,
  getUserPlaylists,
  searchPlaylists,
} from '../queries';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types';

// Mock the transforms module
vi.mock('../playlists/transforms', () => ({
  transformPlaylistFromRPC: vi.fn((data) => ({
    id: data.playlist_id,
    created_at: data.playlist_created_at,
    name: data.playlist_name,
    short_id: data.playlist_short_id,
    created_by: data.playlist_created_by,
    description: data.playlist_description,
    image_url: data.playlist_image_url,
    type: data.playlist_type,
    image_properties: data.playlist_image_properties,
    youtube_id: data.playlist_youtube_id,
    thumbnail_url: data.playlist_thumbnail_url,
    deleted_at: data.playlist_deleted_at,
    duration_seconds: data.duration_seconds,
    image_processing_status: data.playlist_image_processing_status,
  })),
  transformUserPlaylistFromRPC: vi.fn((data) => ({
    id: data.playlist_id,
    created_at: data.playlist_created_at,
    name: data.playlist_name,
    short_id: data.playlist_short_id,
    created_by: data.playlist_created_by,
    description: data.playlist_description,
    image_url: data.playlist_image_url,
    type: data.playlist_type,
    image_properties: data.playlist_image_properties,
    youtube_id: data.playlist_youtube_id,
    thumbnail_url: data.playlist_thumbnail_url,
    deleted_at: data.playlist_deleted_at,
    duration_seconds: data.duration_seconds,
    image_processing_status: data.playlist_image_processing_status,
    profile_username: data.profile_username,
    profile_avatar_url: data.profile_avatar_url,
    sorted_by: data.sorted_by,
    sort_order: data.sort_order,
    playlist_position: data.playlist_position,
  })),
  transformVideoFromRPC: vi.fn((data, supabase) => ({
    id: data.video_id,
    source: data.video_source,
    title: data.video_title,
    description: data.video_description,
    thumbnail_url: data.video_thumbnail_url,
    image_url: data.video_image_url,
    published_at: data.video_published_at,
    duration: data.video_duration,
    views: data.video_views,
    video_start_seconds: data.video_start_seconds,
    updated_at: data.video_updated_at,
    watched_at: data.video_watched_at,
    playlist_name: data.playlist_name,
    playlist_short_id: data.playlist_short_id,
    playlist_sorted_by: data.playlist_sorted_by,
    playlist_sort_order: data.playlist_sort_order,
    position: data.video_position,
  })),
  transformVideoFromContextRPC: vi.fn((data, supabase) => ({
    id: data.video_id,
    source: data.video_source,
    title: data.video_title,
    description: data.video_description,
    thumbnail_url: data.video_thumbnail_url,
    image_url: data.video_image_url,
    published_at: data.video_published_at,
    duration: data.video_duration,
    views: data.video_views,
    video_start_seconds: data.video_start_seconds,
    updated_at: data.video_updated_at,
    watched_at: data.video_watched_at,
    position: data.video_position,
  })),
  getFullImageUrl: vi.fn((url, supabase) =>
    url ? `https://supabase.co/storage/v1/object/public/${url}` : null
  ),
}));

describe('playlist queries module', () => {
  let mockSupabase: SupabaseClient<Database>;

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn(),
      auth: {
        getClaims: vi.fn(),
      },
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: 'https://example.com/mock-url' },
          }),
        }),
      },
    } as any;
  });

  describe('getPlaylistData', () => {
    it('should fetch playlist data with shortId successfully', async () => {
      const mockPlaylistData = [
        {
          playlist_id: 1,
          playlist_created_at: '2023-01-01T00:00:00.000Z',
          playlist_name: 'Test Playlist',
          playlist_short_id: 'tp123',
          playlist_created_by: 'user1',
          playlist_description: 'Test description',
          playlist_image_url: 'path/to/image.webp',
          playlist_type: 'Public',
          playlist_image_properties: null,
          playlist_youtube_id: null,
          playlist_thumbnail_url: 'https://youtube.com/thumb.jpg',
          playlist_deleted_at: null,
          playlist_image_processing_status: 'completed',
          playlist_sorted_by: 'datePublished',
          playlist_sort_order: 'ascending',
          playlist_position: 1,
          profile_username: 'testuser',
          profile_avatar_url: 'https://example.com/avatar.jpg',
          total_duration_seconds: 3600,
          total_videos_count: 5,
          is_duration_row: false,
          video_id: 'video1',
          video_source: 'youtube',
          video_title: 'Video 1',
          video_description: 'Video 1 description',
          video_thumbnail_url: 'https://youtube.com/video1.jpg',
          video_image_url: 'path/to/video1.webp',
          video_published_at: '2023-01-01T00:00:00.000Z',
          video_duration: '00:10:00',
          video_views: 1000,
          video_start_seconds: null,
          video_updated_at: null,
          video_watched_at: null,
          video_position: 1,
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockPlaylistData,
        error: null,
      });

      const result = await getPlaylistData({
        shortId: 'tp123',
        contentFilter: {
          type: 'playlist',
          sort: { key: 'datePublished', order: 'ascending' },
        },
        currentPage: 1,
        limit: 50,
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_playlist_data', {
        p_short_id: 'tp123',
        p_youtube_id: undefined,
        p_current_page: 1,
        p_limit: 50,
        p_sort_key: 'datePublished',
        p_sort_order: 'ascending',
        p_preferred_image_format: 'webp',
      });

      expect(result.error).toBeNull();
      expect(result.playlist).toMatchObject({
        id: 1,
        name: 'Test Playlist',
        short_id: 'tp123',
      });
      expect(result.videos).toHaveLength(1);
      expect(result.videosCount).toBe(5);
      expect(result.playlistDuration).toEqual({
        hours: 1,
        minutes: 0,
        seconds: 0,
      });
    });

    it('should fetch playlist data with youtubeId successfully', async () => {
      const mockPlaylistData = [
        {
          playlist_id: 2,
          playlist_created_at: '2023-01-02T00:00:00.000Z',
          playlist_name: 'YouTube Playlist',
          playlist_short_id: 'yt456',
          playlist_created_by: 'user2',
          playlist_description: 'YouTube description',
          playlist_image_url: null,
          playlist_type: 'Public',
          playlist_image_properties: null,
          playlist_youtube_id: 'PLtest123',
          playlist_thumbnail_url: 'https://youtube.com/yt_thumb.jpg',
          playlist_deleted_at: null,
          playlist_image_processing_status: null,
          playlist_sorted_by: 'title',
          playlist_sort_order: 'descending',
          playlist_position: 2,
          profile_username: 'youtubeuser',
          profile_avatar_url: null,
          total_duration_seconds: 7265, // 2 hours, 1 minute, 5 seconds
          total_videos_count: 10,
          is_duration_row: false,
          video_id: 'yt_video1',
          video_source: 'youtube',
          video_title: 'YouTube Video 1',
          video_description: 'YouTube video description',
          video_thumbnail_url: 'https://youtube.com/yt_video1.jpg',
          video_image_url: null,
          video_published_at: '2023-01-02T00:00:00.000Z',
          video_duration: '00:15:30',
          video_views: 2000,
          video_start_seconds: 90,
          video_updated_at: '2023-01-03T00:00:00.000Z',
          video_watched_at: '2023-01-03T00:00:00.000Z',
          video_position: 1,
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockPlaylistData,
        error: null,
      });

      const result = await getPlaylistData({
        youtubeId: 'PLtest123',
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_playlist_data', {
        p_short_id: undefined,
        p_youtube_id: 'PLtest123',
        p_current_page: 1,
        p_limit: 100,
        p_sort_key: 'playlistOrder',
        p_sort_order: 'ascending',
        p_preferred_image_format: 'avif',
      });

      expect(result.playlist).toMatchObject({
        id: 2,
        name: 'YouTube Playlist',
        youtube_id: 'PLtest123',
      });
      expect(result.playlistDuration).toEqual({
        hours: 2,
        minutes: 1,
        seconds: 5,
      });
    });

    it('should throw error when both shortId and youtubeId are provided', async () => {
      await expect(
        getPlaylistData({
          shortId: 'tp123',
          youtubeId: 'PLtest123',
          supabase: mockSupabase,
          preferredImageFormat: 'webp',
        })
      ).rejects.toThrow('Exactly one of shortId or youtubeId must be provided');
    });

    it('should throw error when neither shortId nor youtubeId are provided', async () => {
      await expect(
        getPlaylistData({
          supabase: mockSupabase,
          preferredImageFormat: 'webp',
        })
      ).rejects.toThrow('Exactly one of shortId or youtubeId must be provided');
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Playlist not found', code: '404' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await getPlaylistData({
        shortId: 'nonexistent',
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toEqual(mockError);
      expect(result.playlist).toBeNull();
      expect(result.videos).toEqual([]);
      expect(result.videosCount).toBe(0);
    });

    it('should handle empty data response', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await getPlaylistData({
        shortId: 'empty',
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toBeNull();
      expect(result.playlist).toBeNull();
      expect(result.videos).toEqual([]);
      expect(result.videosCount).toBe(0);
    });
  });

  describe('getPlaylistDataByYoutubeId', () => {
    it('should call getPlaylistData with youtube parameters', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: [],
        error: null,
      });

      await getPlaylistDataByYoutubeId({
        youtubeId: 'PLtest456',
        contentFilter: {
          type: 'playlist',
          sort: { key: 'title', order: 'ascending' },
        },
        currentPage: 2,
        limit: 25,
        supabase: mockSupabase,
        preferredImageFormat: 'jpeg',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_playlist_data', {
        p_short_id: undefined,
        p_youtube_id: 'PLtest456',
        p_current_page: 2,
        p_limit: 25,
        p_sort_key: 'title',
        p_sort_order: 'ascending',
        p_preferred_image_format: 'jpeg',
      });
    });
  });

  describe('getPlaylistsForUsername', () => {
    it('should fetch playlists for username successfully', async () => {
      const mockPlaylistsData = [
        {
          id: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          name: 'User Playlist 1',
          short_id: 'up1',
          created_by: 'user1',
          description: 'First playlist',
          image_url: 'path/to/playlist1.webp',
          image_processing_status: 'completed',
          type: 'Public',
          image_properties: null,
          youtube_id: null,
          playlist_thumbnail_url: 'https://youtube.com/playlist1.jpg',
          deleted_at: null,
          duration_seconds: 1800,
          profile_username: 'testuser',
          profile_avatar_url: 'https://example.com/testuser.jpg',
        },
        {
          id: 2,
          created_at: '2023-01-02T00:00:00.000Z',
          name: 'User Playlist 2',
          short_id: 'up2',
          created_by: 'user1',
          description: 'Second playlist',
          image_url: null,
          image_processing_status: null,
          type: 'Private',
          image_properties: null,
          youtube_id: 'PLuser123',
          playlist_thumbnail_url: null,
          deleted_at: null,
          duration_seconds: 3600,
          profile_username: 'testuser',
          profile_avatar_url: 'https://example.com/testuser.jpg',
        },
      ];

      (mockSupabase.rpc as any).mockReturnValue({
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockPlaylistsData,
          count: 2,
          error: null,
        }),
      });

      const result = await getPlaylistsForUsername({
        username: 'testuser',
        currentPage: 1,
        limit: 10,
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_playlists_for_username',
        {
          p_username: 'testuser',
          p_preferred_image_format: 'webp',
        },
        { count: 'exact' }
      );
      expect(result.error).toBeNull();
      expect(result.playlists).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.playlists[0]).toMatchObject({
        id: 1,
        name: 'User Playlist 1',
        profile_username: 'testuser',
      });
    });

    it('should handle pagination correctly', async () => {
      (mockSupabase.rpc as any).mockReturnValue({
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      await getPlaylistsForUsername({
        username: 'testuser',
        currentPage: 3,
        limit: 5,
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      const mockReturnValue = (mockSupabase.rpc as any).mock.results[0].value;
      expect(mockReturnValue.range).toHaveBeenCalledWith(10, 14); // (3-1) * 5 = 10, 3 * 5 - 1 = 14
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'User not found', code: '404' };
      (mockSupabase.rpc as any).mockReturnValue({
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: mockError,
        }),
      });

      const result = await getPlaylistsForUsername({
        username: 'nonexistent',
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toEqual(mockError);
      expect(result.playlists).toEqual([]);
    });
  });

  describe('getPlaylistByYoutubeId', () => {
    it('should fetch playlist by YouTube ID successfully', async () => {
      const mockPlaylistData = {
        id: 5,
        name: 'YouTube Playlist',
        short_id: 'yt789',
        youtube_id: 'PLyoutube123',
        created_by: 'user5',
        description: 'YouTube imported playlist',
        type: 'Public',
      };

      (mockSupabase.rpc as any).mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: mockPlaylistData,
          error: null,
        }),
      });

      const result = await getPlaylistByYoutubeId({
        youtubeId: 'PLyoutube123',
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_playlist_by_youtube_id',
        {
          p_youtube_id: 'PLyoutube123',
          p_preferred_image_format: 'webp',
        }
      );
      expect(result.playlist).toEqual(mockPlaylistData);
      expect(result.error).toBeNull();
    });

    it('should handle playlist not found', async () => {
      const mockError = { message: 'Playlist not found', code: '404' };
      (mockSupabase.rpc as any).mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await getPlaylistByYoutubeId({
        youtubeId: 'PLnonexistent',
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      expect(result.playlist).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });

  describe('getPlaylistVideoContext', () => {
    it('should fetch playlist video context successfully', async () => {
      const mockContextData = [
        {
          playlist_id: 1,
          playlist_created_at: '2023-01-01T00:00:00.000Z',
          playlist_name: 'Context Playlist',
          playlist_short_id: 'cp123',
          playlist_created_by: 'user1',
          playlist_description: 'Context description',
          playlist_image_url: 'path/to/context.webp',
          playlist_type: 'Public',
          playlist_image_properties: null,
          playlist_youtube_id: null,
          playlist_thumbnail_url: 'https://youtube.com/context.jpg',
          playlist_deleted_at: null,
          playlist_image_processing_status: 'completed',
          playlist_sorted_by: 'datePublished',
          playlist_sort_order: 'ascending',
          profile_username: 'contextuser',
          profile_avatar_url: 'https://example.com/context.jpg',
          total_videos_count: 10,
          current_video_index: 3,
          video_id: 'current_video',
          video_source: 'youtube',
          video_title: 'Current Video',
          video_description: 'Current video description',
          video_thumbnail_url: 'https://youtube.com/current.jpg',
          video_image_url: 'path/to/current.webp',
          video_published_at: '2023-01-01T00:00:00.000Z',
          video_duration: '00:12:00',
          video_views: 1500,
          video_start_seconds: 120,
          video_updated_at: '2023-01-02T00:00:00.000Z',
          video_watched_at: '2023-01-02T00:00:00.000Z',
          video_position: 3,
        },
        {
          playlist_id: 1,
          playlist_created_at: '2023-01-01T00:00:00.000Z',
          playlist_name: 'Context Playlist',
          playlist_short_id: 'cp123',
          playlist_created_by: 'user1',
          playlist_description: 'Context description',
          playlist_image_url: 'path/to/context.webp',
          playlist_type: 'Public',
          playlist_image_properties: null,
          playlist_youtube_id: null,
          playlist_thumbnail_url: 'https://youtube.com/context.jpg',
          playlist_deleted_at: null,
          playlist_image_processing_status: 'completed',
          playlist_sorted_by: 'datePublished',
          playlist_sort_order: 'ascending',
          profile_username: 'contextuser',
          profile_avatar_url: 'https://example.com/context.jpg',
          total_videos_count: 10,
          current_video_index: 3,
          video_id: 'next_video',
          video_source: 'youtube',
          video_title: 'Next Video',
          video_description: 'Next video description',
          video_thumbnail_url: 'https://youtube.com/next.jpg',
          video_image_url: 'path/to/next.webp',
          video_published_at: '2023-01-02T00:00:00.000Z',
          video_duration: '00:08:30',
          video_views: 800,
          video_start_seconds: null,
          video_updated_at: null,
          video_watched_at: null,
          video_position: 4,
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockContextData,
        error: null,
      });

      const result = await getPlaylistVideoContext({
        shortId: 'cp123',
        videoId: 'current_video',
        contentFilter: {
          type: 'playlist',
          sort: { key: 'datePublished', order: 'ascending' },
        },
        supabase: mockSupabase,
        contextLimit: 5,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_playlist_video_context',
        {
          p_short_id: 'cp123',
          p_video_id: 'current_video',
          p_context_limit: 5,
          p_preferred_image_format: 'webp',
          p_sorted_by: 'datePublished',
          p_sort_order: 'ascending',
        }
      );

      expect(result.error).toBeNull();
      expect(result.playlist).toMatchObject({
        id: 1,
        name: 'Context Playlist',
        short_id: 'cp123',
      });
      expect(result.currentVideo).toMatchObject({
        id: 'current_video',
        title: 'Current Video',
      });
      expect(result.nextVideos).toHaveLength(1);
      expect(result.nextVideo).toMatchObject({
        id: 'next_video',
        title: 'Next Video',
      });
      expect(result.totalVideosCount).toBe(10);
      expect(result.currentVideoIndex).toBe(2); // 0-based index
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Context not found', code: '404' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await getPlaylistVideoContext({
        shortId: 'nonexistent',
        videoId: 'nonexistent_video',
        contentFilter: {
          type: 'playlist',
          sort: { key: 'datePublished', order: 'ascending' },
        },
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toEqual(mockError);
      expect(result.playlist).toBeNull();
      expect(result.currentVideo).toBeNull();
      expect(result.nextVideos).toEqual([]);
    });

    it('should handle empty data response', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await getPlaylistVideoContext({
        shortId: 'empty',
        videoId: 'video',
        contentFilter: {
          type: 'playlist',
          sort: { key: 'datePublished', order: 'ascending' },
        },
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toBeNull();
      expect(result.playlist).toBeNull();
      expect(result.currentVideo).toBeNull();
      expect(result.nextVideos).toEqual([]);
      expect(result.totalVideosCount).toBe(0);
    });
  });

  describe('getUserPlaylists', () => {
    it('should fetch user playlists successfully', async () => {
      const mockUserPlaylistsData = [
        {
          playlist_id: 1,
          playlist_created_at: '2023-01-01T00:00:00.000Z',
          playlist_name: 'My Playlist 1',
          playlist_short_id: 'mp1',
          playlist_created_by: 'current_user',
          playlist_description: 'My first playlist',
          playlist_image_url: 'path/to/my1.webp',
          playlist_type: 'Private',
          playlist_image_properties: null,
          playlist_youtube_id: null,
          playlist_thumbnail_url: null,
          playlist_deleted_at: null,
          playlist_image_processing_status: 'completed',
          profile_username: 'currentuser',
          profile_avatar_url: 'https://example.com/current.jpg',
          sorted_by: 'datePublished',
          sort_order: 'descending',
          playlist_position: 1,
        },
      ];

      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: { claims: { sub: 'current_user' } },
        error: null,
      });

      (mockSupabase.rpc as any).mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: mockUserPlaylistsData,
          count: 1,
          error: null,
        }),
      });

      const result = await getUserPlaylists({
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_user_playlists', {
        p_preferred_image_format: 'webp',
      });
      expect(result.error).toBeNull();
      expect(result.userPlaylists).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should handle unauthenticated user', async () => {
      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: null,
        error: { message: 'Unauthenticated' },
      });

      const result = await getUserPlaylists({
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.userPlaylists).toEqual([]);
      expect(result.count).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Database error', code: '500' };

      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: { claims: { sub: 'current_user' } },
        error: null,
      });

      (mockSupabase.rpc as any).mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: mockError,
        }),
      });

      const result = await getUserPlaylists({
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      expect(result.error).toEqual(mockError);
      expect(result.userPlaylists).toEqual([]);
    });
  });

  describe('searchPlaylists', () => {
    it('should search playlists successfully', async () => {
      const mockSearchData = [
        {
          id: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          name: 'Search Result 1',
          short_id: 'sr1',
          created_by: 'user1',
          description: 'First search result',
          image_url: 'path/to/search1.webp',
          image_processing_status: 'completed',
          type: 'Public',
          image_properties: null,
          youtube_id: null,
          playlist_thumbnail_url: 'https://youtube.com/search1.jpg',
          deleted_at: null,
          duration_seconds: 2400,
          profile_username: 'searchuser1',
          profile_avatar_url: 'https://example.com/search1.jpg',
        },
        {
          id: 2,
          created_at: '2023-01-02T00:00:00.000Z',
          name: 'Search Result 2',
          short_id: 'sr2',
          created_by: 'user2',
          description: 'Second search result',
          image_url: null,
          image_processing_status: null,
          type: 'Public',
          image_properties: null,
          youtube_id: 'PLsearch123',
          playlist_thumbnail_url: null,
          deleted_at: null,
          duration_seconds: 1800,
          profile_username: 'searchuser2',
          profile_avatar_url: null,
        },
      ];

      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: { claims: { sub: 'current_user' } },
        error: null,
      });

      (mockSupabase.rpc as any).mockReturnValue({
        range: vi.fn().mockResolvedValue({
          data: mockSearchData,
          count: 2,
          error: null,
        }),
      });

      const result = await searchPlaylists({
        searchString: 'test search',
        limit: 10,
        currentPage: 1,
        preferredImageFormat: 'webp',
        supabase: mockSupabase,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'search_playlists',
        {
          search_term: 'test search',
          p_preferred_image_format: 'webp',
        },
        { count: 'exact' }
      );
      expect(result.error).toBeNull();
      expect(result.playlists).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should handle unauthenticated search', async () => {
      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: null,
        error: null,
      });

      (mockSupabase.rpc as any).mockReturnValue({
        range: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      await searchPlaylists({
        searchString: 'test',
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'search_playlists',
        {
          search_term: 'test',
          current_user_id: undefined,
          p_preferred_image_format: 'avif',
        },
        { count: 'exact' }
      );
    });

    it('should handle pagination in search', async () => {
      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: { claims: { sub: 'user' } },
        error: null,
      });

      (mockSupabase.rpc as any).mockReturnValue({
        range: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      await searchPlaylists({
        searchString: 'test',
        limit: 5,
        currentPage: 3,
        supabase: mockSupabase,
        preferredImageFormat: 'jpeg',
      });

      const mockReturnValue = (mockSupabase.rpc as any).mock.results[0].value;
      expect(mockReturnValue.range).toHaveBeenCalledWith(10, 14); // (3-1) * 5 = 10, 3 * 5 - 1 = 14
    });

    it('should handle search errors', async () => {
      const mockError = { message: 'Search failed', code: '500' };

      (mockSupabase.auth.getClaims as any).mockResolvedValue({
        data: { claims: { sub: 'user' } },
        error: null,
      });

      (mockSupabase.rpc as any).mockReturnValue({
        range: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: mockError,
        }),
      });

      const result = await searchPlaylists({
        searchString: 'test',
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toEqual(mockError);
      expect(result.playlists).toEqual([]);
    });
  });
});
