import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transformTimestampFromRPC,
  saveVideoTimestamp,
  saveVideoTimestamps,
  deleteVideoTimestamps,
  getLatestTimestamp,
  hasPlaylistTimestamp,
  type TimestampWithVideoId,
  type VideoTimestamp,
} from '../timestamps';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { VideoWithTimestamp } from '../videos';

// Mock Supabase client
const createMockSupabaseClient = () => {
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();

  // Chain methods for RPC calls
  mockRpc.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ data: [], error: null });

  // Chain methods for table queries
  mockSingle.mockReturnValue({ data: null, error: null });
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  });

  return {
    rpc: mockRpc,
    from: mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
  } as any;
};

const createMockSession = (): Session => ({
  access_token: 'mock-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  refresh_token: 'mock-refresh',
  user: {
    id: 'user-123',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    email_confirmed_at: '2023-01-01T00:00:00Z',
    phone: '',
    confirmed_at: '2023-01-01T00:00:00Z',
    last_sign_in_at: '2023-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    is_anonymous: false,
  },
});

describe('timestamps utilities', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockSession: Session;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockSession = createMockSession();
  });

  describe('transformTimestampFromRPC', () => {
    it('should transform RPC data with all fields', () => {
      const rpcData = {
        video_start_seconds: 300,
        updated_at: '2023-01-01T12:00:00Z',
        watched_at: '2023-01-01T11:00:00Z',
        playlist_name: 'My Playlist',
        playlist_short_id: 'abc123',
        playlist_sorted_by: 'title',
        playlist_sort_order: 'ascending',
      } as any;

      const result = transformTimestampFromRPC(rpcData);

      expect(result).toEqual({
        video_start_seconds: 300,
        updated_at: '2023-01-01T12:00:00Z',
        watched_at: '2023-01-01T11:00:00Z',
        playlist_name: 'My Playlist',
        playlist_short_id: 'abc123',
        playlist_sorted_by: 'title',
        playlist_sort_order: 'ascending',
      });
    });

    it('should handle null values', () => {
      const rpcData = {
        video_start_seconds: null,
        updated_at: null,
        watched_at: null,
        playlist_name: null,
        playlist_short_id: null,
        playlist_sorted_by: null,
        playlist_sort_order: null,
      } as any;

      const result = transformTimestampFromRPC(rpcData);

      expect(result).toEqual({
        video_start_seconds: null,
        updated_at: null,
        watched_at: null,
        playlist_name: null,
        playlist_short_id: null,
        playlist_sorted_by: null,
        playlist_sort_order: null,
      });
    });

    it('should handle undefined values as null', () => {
      const rpcData = {
        video_start_seconds: undefined,
        updated_at: undefined,
        watched_at: undefined,
        playlist_name: undefined,
        playlist_short_id: undefined,
        playlist_sorted_by: undefined,
        playlist_sort_order: undefined,
      } as any;

      const result = transformTimestampFromRPC(rpcData);

      expect(result).toEqual({
        video_start_seconds: null,
        updated_at: null,
        watched_at: null,
        playlist_name: null,
        playlist_short_id: null,
        playlist_sorted_by: null,
        playlist_sort_order: null,
      });
    });

    it('should handle zero video_start_seconds', () => {
      const rpcData = {
        video_start_seconds: 0,
        updated_at: '2023-01-01T12:00:00Z',
        watched_at: '2023-01-01T11:00:00Z',
        playlist_name: 'Test Playlist',
        playlist_short_id: 'test123',
        playlist_sorted_by: 'created_at',
        playlist_sort_order: 'descending',
      } as any;

      const result = transformTimestampFromRPC(rpcData);

      // The function converts falsy values to null, so 0 becomes null
      expect(result.video_start_seconds).toBe(null);
    });

    it('should handle empty strings as null', () => {
      const rpcData = {
        video_start_seconds: 120,
        updated_at: '',
        watched_at: '',
        playlist_name: '',
        playlist_short_id: '',
        playlist_sorted_by: '',
        playlist_sort_order: '',
      } as any;

      const result = transformTimestampFromRPC(rpcData);

      expect(result).toEqual({
        video_start_seconds: 120,
        updated_at: null,
        watched_at: null,
        playlist_name: null,
        playlist_short_id: null,
        playlist_sorted_by: null,
        playlist_sort_order: null,
      });
    });
  });

  describe('saveVideoTimestamp', () => {
    it('should save timestamp successfully with session', async () => {
      const mockVideos = [{ id: 'video-1', timestamp: 300 }];
      mockSupabase.mockSelect.mockReturnValue({
        data: mockVideos,
        error: null,
      });

      const videoTimestamp: TimestampWithVideoId = {
        videoId: 'video-123',
        timestampStartSeconds: 300,
        watchedAt: new Date('2023-01-01T12:00:00Z'),
        playlistId: 456,
        sortedBy: 'title',
        sortOrder: 'ascending',
      };

      const result = await saveVideoTimestamp({
        videoTimestamp,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('insert_timestamp', {
        p_video_id: 'video-123',
        p_video_start_seconds: 300,
        p_watched_at: new Date('2023-01-01T12:00:00Z'),
        p_playlist_id: 456,
        p_sorted_by: 'title',
        p_sort_order: 'ascending',
      });
      expect(result.videos).toEqual(mockVideos);
      expect(result.error).toBeUndefined();
    });

    it('should handle null session', async () => {
      const videoTimestamp: TimestampWithVideoId = {
        videoId: 'video-123',
        timestampStartSeconds: 300,
        watchedAt: new Date('2023-01-01T12:00:00Z'),
      };

      const result = await saveVideoTimestamp({
        videoTimestamp,
        supabase: mockSupabase,
        session: null,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(result.videos).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle undefined optional fields', async () => {
      const mockVideos = [{ id: 'video-1' }];
      mockSupabase.mockSelect.mockReturnValue({
        data: mockVideos,
        error: null,
      });

      const videoTimestamp: TimestampWithVideoId = {
        videoId: 'video-123',
        timestampStartSeconds: undefined,
        watchedAt: null,
        // playlistId, sortedBy, sortOrder not provided
      };

      const result = await saveVideoTimestamp({
        videoTimestamp,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('insert_timestamp', {
        p_video_id: 'video-123',
        p_video_start_seconds: undefined,
        p_watched_at: null,
        p_playlist_id: undefined,
        p_sorted_by: undefined,
        p_sort_order: undefined,
      });
      expect(result.videos).toEqual(mockVideos);
    });

    it('should handle RPC error', async () => {
      const mockError = { message: 'Database error', code: 'DB_ERROR' };
      mockSupabase.mockSelect.mockReturnValue({ data: null, error: mockError });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const videoTimestamp: TimestampWithVideoId = {
        videoId: 'video-123',
        timestampStartSeconds: 300,
        watchedAt: new Date('2023-01-01T12:00:00Z'),
      };

      const result = await saveVideoTimestamp({
        videoTimestamp,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving video timestamps.',
        mockError
      );
      expect(result.error).toEqual(mockError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('saveVideoTimestamps', () => {
    it('should save multiple timestamps successfully', async () => {
      const mockVideos = [{ id: 'video-1' }, { id: 'video-2' }];
      mockSupabase.mockSelect.mockReturnValue({
        data: mockVideos,
        error: null,
      });

      const videoTimestamps: TimestampWithVideoId[] = [
        {
          videoId: 'video-1',
          timestampStartSeconds: 300,
          watchedAt: new Date('2023-01-01T12:00:00Z'),
        },
        {
          videoId: 'video-2',
          timestampStartSeconds: 600,
          watchedAt: new Date('2023-01-01T13:00:00Z'),
        },
      ];

      const result = await saveVideoTimestamps({
        videoTimestamps,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('insert_timestamps', {
        p_video_ids: ['video-1', 'video-2'],
        p_video_start_seconds: [300, 600],
        p_watched_at: ['2023-01-01T12:00:00.000Z', '2023-01-01T13:00:00.000Z'],
      });
      expect(result.videos).toEqual(mockVideos);
      expect(result.error).toBeUndefined();
    });

    it('should handle empty timestamps array', async () => {
      const result = await saveVideoTimestamps({
        videoTimestamps: [],
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(result.videos).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle null session', async () => {
      const videoTimestamps: TimestampWithVideoId[] = [
        {
          videoId: 'video-1',
          timestampStartSeconds: 300,
          watchedAt: new Date('2023-01-01T12:00:00Z'),
        },
      ];

      const result = await saveVideoTimestamps({
        videoTimestamps,
        supabase: mockSupabase,
        session: null,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(result.videos).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle undefined timestamp values', async () => {
      const mockVideos = [{ id: 'video-1' }];
      mockSupabase.mockSelect.mockReturnValue({
        data: mockVideos,
        error: null,
      });

      const videoTimestamps: TimestampWithVideoId[] = [
        {
          videoId: 'video-1',
          timestampStartSeconds: undefined,
          watchedAt: null,
        },
        {
          videoId: 'video-2',
          timestampStartSeconds: 150,
          watchedAt: new Date('2023-01-01T14:00:00Z'),
        },
      ];

      const result = await saveVideoTimestamps({
        videoTimestamps,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('insert_timestamps', {
        p_video_ids: ['video-1', 'video-2'],
        p_video_start_seconds: [null, 150],
        p_watched_at: [null, '2023-01-01T14:00:00.000Z'],
      });
      expect(result.videos).toEqual(mockVideos);
    });
  });

  describe('deleteVideoTimestamps', () => {
    it('should delete timestamps successfully', async () => {
      const mockVideos = [{ id: 'video-1' }];
      mockSupabase.mockSelect.mockReturnValue({
        data: mockVideos,
        error: null,
      });

      const result = await deleteVideoTimestamps({
        videoIds: ['video-1', 'video-2'],
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_timestamps', {
        p_video_ids: ['video-1', 'video-2'],
      });
      expect(result.videos).toEqual(mockVideos);
      expect(result.error).toBeUndefined();
    });

    it('should handle empty video IDs array', async () => {
      const result = await deleteVideoTimestamps({
        videoIds: [],
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.videos).toBeUndefined();
    });

    it('should handle null session', async () => {
      const result = await deleteVideoTimestamps({
        videoIds: ['video-1'],
        supabase: mockSupabase,
        session: null,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.videos).toBeUndefined();
    });

    it('should handle session without user', async () => {
      const sessionWithoutUser = { ...mockSession, user: null } as any;

      const result = await deleteVideoTimestamps({
        videoIds: ['video-1'],
        supabase: mockSupabase,
        session: sessionWithoutUser,
      });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.videos).toBeUndefined();
    });

    it('should handle RPC error', async () => {
      const mockError = { message: 'Delete failed', code: 'DELETE_ERROR' };
      mockSupabase.mockSelect.mockReturnValue({ data: null, error: mockError });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await deleteVideoTimestamps({
        videoIds: ['video-1'],
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error deleting video timestamps.',
        mockError
      );
      expect(result.error).toEqual(mockError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getLatestTimestamp', () => {
    it('should get latest timestamp successfully', async () => {
      const mockTimestamp = {
        video_id: 'video-123',
        user_id: 'user-123',
        video_start_seconds: 300,
        watched_at: '2023-01-01T12:00:00Z',
      };
      mockSupabase.mockSingle.mockReturnValue({
        data: mockTimestamp,
        error: null,
      });

      const result = await getLatestTimestamp({
        videoId: 'video-123',
        supabase: mockSupabase as any,
        session: mockSession,
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('timestamps');
      expect(result.videoTimestamp).toEqual(mockTimestamp);
      expect(result.error).toBeNull();
    });

    it('should handle null session', async () => {
      const result = await getLatestTimestamp({
        videoId: 'video-123',
        supabase: mockSupabase as any,
        session: null,
      });

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.videoTimestamp).toBeUndefined();
    });

    it('should handle session without user', async () => {
      const sessionWithoutUser = { ...mockSession, user: null } as any;

      const result = await getLatestTimestamp({
        videoId: 'video-123',
        supabase: mockSupabase as any,
        session: sessionWithoutUser,
      });

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.videoTimestamp).toBeUndefined();
    });

    it('should handle empty video ID', async () => {
      const result = await getLatestTimestamp({
        videoId: '',
        supabase: mockSupabase as any,
        session: mockSession,
      });

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.videoTimestamp).toBeUndefined();
    });

    it('should handle query error', async () => {
      const mockError = { message: 'Query failed', code: 'QUERY_ERROR' };
      mockSupabase.mockSingle.mockReturnValue({ data: null, error: mockError });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await getLatestTimestamp({
        videoId: 'video-123',
        supabase: mockSupabase as any,
        session: mockSession,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error getting latest timestamp:',
        mockError
      );
      expect(result.error).toEqual(mockError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('hasPlaylistTimestamp', () => {
    it('should return true when all playlist fields are present', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: 'abc123',
        playlist_sorted_by: 'title',
        playlist_sort_order: 'ascending',
        // other required fields
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(true);
      // Type assertion should work if function returns true
      if (result) {
        expect(video.playlist_short_id).toBe('abc123');
        expect(video.playlist_sorted_by).toBe('title');
        expect(video.playlist_sort_order).toBe('ascending');
      }
    });

    it('should return false when playlist_short_id is missing', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: null,
        playlist_sorted_by: 'title',
        playlist_sort_order: 'ascending',
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(false);
    });

    it('should return false when playlist_sorted_by is missing', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: 'abc123',
        playlist_sorted_by: null,
        playlist_sort_order: 'ascending',
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(false);
    });

    it('should return false when playlist_sort_order is missing', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: 'abc123',
        playlist_sorted_by: 'title',
        playlist_sort_order: null,
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(false);
    });

    it('should return false when all playlist fields are missing', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: null,
        playlist_sorted_by: null,
        playlist_sort_order: null,
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(false);
    });

    it('should return false when playlist fields are undefined', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: undefined,
        playlist_sorted_by: undefined,
        playlist_sort_order: undefined,
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(false);
    });

    it('should return false when playlist fields are empty strings', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: '',
        playlist_sorted_by: '',
        playlist_sort_order: '',
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(false);
    });

    it('should handle different sort keys and orders', () => {
      const video: VideoWithTimestamp = {
        id: 'video-123',
        title: 'Test Video',
        playlist_short_id: 'xyz789',
        playlist_sorted_by: 'created_at',
        playlist_sort_order: 'descending',
      } as any;

      const result = hasPlaylistTimestamp(video);

      expect(result).toBe(true);
    });
  });
});
