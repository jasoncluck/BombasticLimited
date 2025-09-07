import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFullImageUrl,
  transformPlaylistFromRPC,
  transformUserPlaylistFromRPC,
  transformVideoFromRPC,
  transformVideoFromContextRPC,
} from '../transforms';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types';
import type {
  GetPlaylistDataResponse,
  GetUserPlaylistsResponse,
  GetPlaylistVideoContextResponse,
} from '../types';

describe('playlist transforms module', () => {
  let mockSupabase: SupabaseClient<Database>;

  beforeEach(() => {
    mockSupabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: 'https://supabase.co/storage/v1/object/public/images/test.jpg' }
          })
        })
      }
    } as any;
  });

  describe('getFullImageUrl', () => {
    it('should return full URL for valid storage path', () => {
      const storagePath = 'playlists/123/image.jpg';
      
      const result = getFullImageUrl(storagePath, mockSupabase);
      
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
      expect(result).toBe('https://supabase.co/storage/v1/object/public/images/test.jpg');
    });

    it('should return null for null storage path', () => {
      const result = getFullImageUrl(null, mockSupabase);
      
      expect(result).toBeNull();
      expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    });

    it('should return null for empty string storage path', () => {
      const result = getFullImageUrl('', mockSupabase);
      
      expect(result).toBeNull();
      expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    });

    it('should handle different storage paths', () => {
      const testPaths = [
        'playlists/123/thumbnail.webp',
        'users/456/avatar.png',
        'videos/789/preview.avif',
        'folder/subfolder/image.gif',
      ];

      testPaths.forEach((path) => {
        const result = getFullImageUrl(path, mockSupabase);
        expect(result).toBe('https://supabase.co/storage/v1/object/public/images/test.jpg');
      });

      expect(mockSupabase.storage.from).toHaveBeenCalledTimes(testPaths.length);
    });

    it('should handle storage service errors gracefully', () => {
      const mockStorage = {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: null },
            error: { message: 'Storage error' }
          })
        })
      };
      
      const supabaseWithError = { storage: mockStorage } as any;
      
      const result = getFullImageUrl('test/path.jpg', supabaseWithError);
      
      expect(result).toBeNull();
    });
  });

  describe('transformPlaylistFromRPC', () => {
    it('should transform RPC data to Playlist type correctly', () => {
      const rpcData: GetPlaylistDataResponse = {
        playlist_id: 123,
        playlist_created_at: '2023-01-01T00:00:00Z',
        playlist_name: 'Test Playlist',
        playlist_short_id: 'pl123',
        playlist_created_by: 'user456',
        playlist_description: 'A test playlist',
        playlist_image_url: 'playlists/123/image.jpg',
        playlist_image_processing_status: 'completed',
        playlist_type: 'Public',
        playlist_image_properties: { x: 0, y: 0, width: 100, height: 100 },
        playlist_youtube_id: 'PLtest123',
        playlist_thumbnail_url: 'https://youtube.com/thumb.jpg',
        playlist_deleted_at: null,
        total_duration_seconds: 3600,
        profile_username: 'testuser',
        profile_avatar_url: 'https://avatar.com/user.jpg',
        // Video fields (not used in playlist transform)
        video_id: 'video1',
        video_position: 1,
        video_source: 'youtube',
        video_title: 'Test Video',
        video_description: 'Video description',
        video_thumbnail_url: 'https://video.com/thumb.jpg',
        video_image_url: null,
        video_published_at: '2023-01-01T00:00:00Z',
        video_duration: 'PT5M',
        video_start_seconds: 0,
        video_updated_at: null,
        video_watched_at: null,
      };

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);

      expect(result).toEqual({
        id: 123,
        created_at: '2023-01-01T00:00:00Z',
        name: 'Test Playlist',
        short_id: 'pl123',
        created_by: 'user456',
        description: 'A test playlist',
        image_url: 'https://supabase.co/storage/v1/object/public/images/test.jpg',
        image_processing_status: 'completed',
        type: 'Public',
        image_properties: { x: 0, y: 0, width: 100, height: 100 },
        youtube_id: 'PLtest123',
        thumbnail_url: 'https://youtube.com/thumb.jpg',
        deleted_at: null,
        duration_seconds: 3600,
        profile_username: 'testuser',
        profile_avatar_url: 'https://avatar.com/user.jpg',
        updated_at: null,
        image_processing_updated_at: null,
      });
    });

    it('should handle null/undefined values correctly', () => {
      const rpcData: GetPlaylistDataResponse = {
        playlist_id: 456,
        playlist_created_at: '2023-01-01T00:00:00Z',
        playlist_name: 'Minimal Playlist',
        playlist_short_id: 'pl456',
        playlist_created_by: 'user789',
        playlist_description: null,
        playlist_image_url: null,
        playlist_image_processing_status: null,
        playlist_type: 'Private',
        playlist_image_properties: null,
        playlist_youtube_id: null,
        playlist_thumbnail_url: null,
        playlist_deleted_at: null,
        total_duration_seconds: null,
        profile_username: null,
        profile_avatar_url: null,
        video_id: 'video1',
        video_position: 1,
        video_source: 'youtube',
        video_title: 'Test Video',
        video_description: 'Video description',
        video_thumbnail_url: 'https://video.com/thumb.jpg',
        video_image_url: null,
        video_published_at: '2023-01-01T00:00:00Z',
        video_duration: 'PT5M',
        video_start_seconds: 0,
        video_updated_at: null,
        video_watched_at: null,
      };

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);

      expect(result.description).toBeNull();
      expect(result.image_url).toBeNull();
      expect(result.image_processing_status).toBeNull();
      expect(result.image_properties).toBeNull();
      expect(result.youtube_id).toBeNull();
      expect(result.thumbnail_url).toBeNull();
      expect(result.duration_seconds).toBeNull();
      expect(result.profile_username).toBeNull();
      expect(result.profile_avatar_url).toBeNull();
    });

    it('should handle different playlist types', () => {
      const types = ['Public', 'Private', 'Unlisted'] as const;

      types.forEach((type) => {
        const rpcData: GetPlaylistDataResponse = {
          playlist_type: type,
          // ... other required fields
        } as any;

        const result = transformPlaylistFromRPC(rpcData, mockSupabase);
        expect(result.type).toBe(type);
      });
    });
  });

  describe('transformUserPlaylistFromRPC', () => {
    it('should transform RPC data to UserPlaylist type correctly', () => {
      const rpcData: GetUserPlaylistsResponse = {
        id: 789,
        created_at: '2023-01-01T00:00:00Z',
        name: 'User Playlist',
        short_id: 'upl789',
        created_by: 'user123',
        description: 'User specific playlist',
        image_url: 'user-playlists/789/image.jpg',
        image_processing_status: 'processing',
        type: 'Public',
        image_properties: { x: 10, y: 20, width: 200, height: 150 },
        youtube_id: 'PLuser789',
        playlist_thumbnail_url: 'https://youtube.com/user-thumb.jpg',
        deleted_at: null,
        duration_seconds: 7200,
        profile_username: 'userplaylist',
        profile_avatar_url: 'https://avatar.com/userplaylist.jpg',
        playlist_position: 5,
        sorted_by: 'title',
        sort_order: 'ascending',
        added_at: '2023-01-02T00:00:00Z',
      };

      const result = transformUserPlaylistFromRPC(rpcData, mockSupabase);

      expect(result).toEqual({
        id: 789,
        created_at: '2023-01-01T00:00:00Z',
        name: 'User Playlist',
        short_id: 'upl789',
        created_by: 'user123',
        description: 'User specific playlist',
        image_url: 'https://supabase.co/storage/v1/object/public/images/test.jpg',
        image_processing_status: 'processing',
        type: 'Public',
        image_properties: { x: 10, y: 20, width: 200, height: 150 },
        youtube_id: 'PLuser789',
        thumbnail_url: 'https://youtube.com/user-thumb.jpg',
        deleted_at: null,
        duration_seconds: 7200,
        profile_username: 'userplaylist',
        profile_avatar_url: 'https://avatar.com/userplaylist.jpg',
        playlist_position: 5,
        sorted_by: 'title',
        sort_order: 'ascending',
        added_at: '2023-01-02T00:00:00Z',
      });
    });

    it('should handle user playlist specific fields', () => {
      const rpcData: GetUserPlaylistsResponse = {
        id: 100,
        playlist_position: 1,
        sorted_by: 'views',
        sort_order: 'descending',
        added_at: '2023-01-01T12:00:00Z',
        // ... other fields
      } as any;

      const result = transformUserPlaylistFromRPC(rpcData, mockSupabase);

      expect(result.playlist_position).toBe(1);
      expect(result.sorted_by).toBe('views');
      expect(result.sort_order).toBe('descending');
      expect(result.added_at).toBe('2023-01-01T12:00:00Z');
    });
  });

  describe('transformVideoFromRPC', () => {
    it('should transform RPC data to PlaylistVideoWithTimestamp type correctly', () => {
      const rpcData: GetPlaylistDataResponse = {
        video_id: 'vid123',
        video_position: 3,
        video_source: 'youtube',
        video_title: 'Amazing Video',
        video_description: 'This is an amazing video',
        video_thumbnail_url: 'https://youtube.com/vid123.jpg',
        video_image_url: 'videos/vid123/processed.webp',
        video_published_at: '2023-01-01T00:00:00Z',
        video_duration: 'PT10M30S',
        video_start_seconds: 120,
        video_updated_at: '2023-01-01T01:00:00Z',
        video_watched_at: '2023-01-01T02:00:00Z',
        // Playlist fields (not used in video transform)
        playlist_id: 1,
        playlist_name: 'Test',
        playlist_short_id: 'pl1',
        playlist_created_by: 'user1',
        playlist_created_at: '2023-01-01T00:00:00Z',
        playlist_description: null,
        playlist_image_url: null,
        playlist_image_processing_status: null,
        playlist_type: 'Public',
        playlist_image_properties: null,
        playlist_youtube_id: null,
        playlist_thumbnail_url: null,
        playlist_deleted_at: null,
        total_duration_seconds: null,
        profile_username: null,
        profile_avatar_url: null,
      };

      const result = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result).toEqual({
        id: 'vid123',
        video_position: 3,
        source: 'youtube',
        title: 'Amazing Video',
        description: 'This is an amazing video',
        thumbnail_url: 'https://youtube.com/vid123.jpg',
        image_url: 'https://supabase.co/storage/v1/object/public/images/test.jpg',
        published_at: '2023-01-01T00:00:00Z',
        duration: 'PT10M30S',
        video_start_seconds: 120,
        updated_at: '2023-01-01T01:00:00Z',
        watched_at: '2023-01-01T02:00:00Z',
        views: 0,
      });
    });

    it('should fall back to thumbnail_url when video_image_url is null', () => {
      const rpcData: GetPlaylistDataResponse = {
        video_id: 'vid456',
        video_image_url: null,
        video_thumbnail_url: 'https://youtube.com/fallback.jpg',
        // ... other required fields
      } as any;

      const result = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result.image_url).toBe('https://youtube.com/fallback.jpg');
    });

    it('should handle different video sources', () => {
      const sources = ['youtube', 'twitch', 'vimeo'] as const;

      sources.forEach((source) => {
        const rpcData: GetPlaylistDataResponse = {
          video_source: source,
          // ... other required fields
        } as any;

        const result = transformVideoFromRPC(rpcData, mockSupabase);
        expect(result.source).toBe(source);
      });
    });

    it('should handle timestamp fields correctly', () => {
      const rpcData: GetPlaylistDataResponse = {
        video_start_seconds: null,
        video_updated_at: null,
        video_watched_at: null,
        // ... other required fields
      } as any;

      const result = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result.video_start_seconds).toBeNull();
      expect(result.updated_at).toBeNull();
      expect(result.watched_at).toBeNull();
    });
  });

  describe('transformVideoFromContextRPC', () => {
    it('should transform context RPC data to PlaylistVideoWithTimestamp type correctly', () => {
      const rpcData: GetPlaylistVideoContextResponse = {
        video_id: 'ctx123',
        video_position: 7,
        video_source: 'twitch',
        video_title: 'Context Video',
        video_description: 'Video from context query',
        video_thumbnail_url: 'https://twitch.tv/ctx123.jpg',
        video_image_url: 'videos/ctx123/context.avif',
        video_published_at: '2023-01-01T00:00:00Z',
        video_duration: 'PT15M',
        video_start_seconds: 300,
        video_updated_at: '2023-01-01T03:00:00Z',
        video_watched_at: '2023-01-01T04:00:00Z',
      };

      const result = transformVideoFromContextRPC(rpcData, mockSupabase);

      expect(result).toEqual({
        id: 'ctx123',
        video_position: 7,
        source: 'twitch',
        title: 'Context Video',
        description: 'Video from context query',
        thumbnail_url: 'https://twitch.tv/ctx123.jpg',
        image_url: 'https://supabase.co/storage/v1/object/public/images/test.jpg',
        published_at: '2023-01-01T00:00:00Z',
        duration: 'PT15M',
        video_start_seconds: 300,
        updated_at: '2023-01-01T03:00:00Z',
        watched_at: '2023-01-01T04:00:00Z',
        views: 0,
      });
    });

    it('should handle null image_url in context transform', () => {
      const rpcData: GetPlaylistVideoContextResponse = {
        video_id: 'ctx456',
        video_image_url: null,
        // ... other required fields
      } as any;

      const result = transformVideoFromContextRPC(rpcData, mockSupabase);

      expect(result.image_url).toBeNull();
    });

    it('should always set views to 0 for context videos', () => {
      const rpcData: GetPlaylistVideoContextResponse = {
        video_id: 'ctx789',
        // ... other required fields
      } as any;

      const result = transformVideoFromContextRPC(rpcData, mockSupabase);

      expect(result.views).toBe(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed date strings', () => {
      const rpcData: GetPlaylistDataResponse = {
        playlist_created_at: 'invalid-date',
        video_published_at: 'another-invalid-date',
        // ... other required fields
      } as any;

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);

      expect(result.created_at).toBe('invalid-date');
    });

    it('should handle very long strings', () => {
      const longString = 'A'.repeat(10000);
      const rpcData: GetPlaylistDataResponse = {
        playlist_name: longString,
        video_title: longString,
        // ... other required fields
      } as any;

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);
      const videoResult = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result.name).toBe(longString);
      expect(videoResult.title).toBe(longString);
    });

    it('should handle special characters in strings', () => {
      const specialString = '🎵 特殊字符 & Special <chars> "quotes" 中文';
      const rpcData: GetPlaylistDataResponse = {
        playlist_name: specialString,
        video_description: specialString,
        // ... other required fields
      } as any;

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);
      const videoResult = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result.name).toBe(specialString);
      expect(videoResult.description).toBe(specialString);
    });

    it('should handle negative numbers', () => {
      const rpcData: GetPlaylistDataResponse = {
        playlist_id: -1,
        video_position: -5,
        video_start_seconds: -100,
        total_duration_seconds: -3600,
        // ... other required fields
      } as any;

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);
      const videoResult = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result.id).toBe(-1);
      expect(result.duration_seconds).toBe(-3600);
      expect(videoResult.video_position).toBe(-5);
      expect(videoResult.video_start_seconds).toBe(-100);
    });

    it('should handle zero values correctly', () => {
      const rpcData: GetPlaylistDataResponse = {
        playlist_id: 0,
        video_position: 0,
        video_start_seconds: 0,
        total_duration_seconds: 0,
        // ... other required fields
      } as any;

      const result = transformPlaylistFromRPC(rpcData, mockSupabase);
      const videoResult = transformVideoFromRPC(rpcData, mockSupabase);

      expect(result.id).toBe(0);
      expect(result.duration_seconds).toBe(0);
      expect(videoResult.video_position).toBe(0);
      expect(videoResult.video_start_seconds).toBe(0);
    });
  });

  describe('supabase storage integration', () => {
    it('should call storage methods correctly for image URLs', () => {
      const storagePath = 'test/path/image.jpg';
      
      getFullImageUrl(storagePath, mockSupabase);
      
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
    });

    it('should handle storage service unavailable', () => {
      const brokenSupabase = {
        storage: {
          from: vi.fn().mockImplementation(() => {
            throw new Error('Storage service unavailable');
          })
        }
      } as any;

      expect(() => getFullImageUrl('test/path.jpg', brokenSupabase)).toThrow('Storage service unavailable');
    });

    it('should handle different storage bucket responses', () => {
      const mockStorage = {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: 'https://custom-domain.com/images/test.jpg' }
          })
        })
      };
      
      const customSupabase = { storage: mockStorage } as any;
      
      const result = getFullImageUrl('custom/path.jpg', customSupabase);
      
      expect(result).toBe('https://custom-domain.com/images/test.jpg');
    });
  });
});