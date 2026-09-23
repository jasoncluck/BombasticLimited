import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPlaylist,
  updatePlaylistPosition,
  deletePlaylist,
  addVideosToPlaylist,
  updatePlaylistVideoPosition,
  deleteVideosFromPlaylist,
  updatePlaylistInfo,
  updatePlaylistThumbnail,
  followPlaylist,
  unfollowPlaylist,
  updatePlaylistSort,
} from '../mutations';
import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import type { Database } from '../../database.types';

// Mock invalidate function
vi.mock('$app/navigation', () => ({
  invalidate: vi.fn(),
}));

// Mock playlist utilities
vi.mock('$lib/components/playlist/playlist', () => ({
  playlistImagePropertiesToJson: vi.fn((props) => props),
}));

describe('playlist mutations module', () => {
  let mockNeon: NeonPostgrestClient<Database>;

  beforeEach(() => {
    mockNeon = {
      rpc: vi.fn(),
      from: vi.fn(),
    } as any;
  });

  describe('createPlaylist', () => {
    it('should create playlist successfully', async () => {
      const mockPlaylistData = {
        id: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        name: 'New Playlist',
        short_id: 'np123',
        created_by: 'user123',
        description: null,
        type: 'Private',
      };

      (mockNeon.rpc as any).mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: mockPlaylistData,
          error: null,
        }),
      });

      const result = await createPlaylist({
        name: 'New Playlist',
        neon: mockNeon,
        userId: 'user123',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('insert_playlist', {
        p_created_by: 'user123',
        p_name: 'New Playlist',
        p_type: 'Private',
      });
      expect(result.playlist).toEqual(mockPlaylistData);
      expect(result.error).toBeNull();
    });

    it('should create playlist without name', async () => {
      (mockNeon.rpc as any).mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 2, name: 'Untitled Playlist' },
          error: null,
        }),
      });

      await createPlaylist({
        neon: mockNeon,
        userId: 'user456',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('insert_playlist', {
        p_created_by: 'user456',
        p_name: undefined,
        p_type: 'Private',
      });
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Database error', code: '500' };

      (mockNeon.rpc as any).mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await createPlaylist({
        name: 'Test Playlist',
        neon: mockNeon,
        userId: 'user123',
      });

      expect(result.playlist).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });

  describe('updatePlaylistPosition', () => {
    it('should update playlist position successfully', async () => {
      (mockNeon.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await updatePlaylistPosition({
        playlistId: 1,
        position: 5,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('update_playlist_position', {
        p_playlist_id: 1,
        p_new_position: 5,
        p_user_id: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Position update failed', code: '400' };
      (mockNeon.rpc as any).mockResolvedValue({
        error: mockError,
      });

      const result = await updatePlaylistPosition({
        playlistId: 2,
        position: 10,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('deletePlaylist', () => {
    it('should delete playlist successfully', async () => {
      (mockNeon.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await deletePlaylist({
        playlistId: 3,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('delete_playlist', {
        p_playlist_id: 3,
        p_user_id: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should handle deletion errors', async () => {
      const mockError = { message: 'Playlist not found', code: '404' };
      (mockNeon.rpc as any).mockResolvedValue({
        error: mockError,
      });

      const result = await deletePlaylist({
        playlistId: 999,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('addVideosToPlaylist', () => {
    it('should add videos to playlist successfully', async () => {
      (mockNeon.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await addVideosToPlaylist({
        playlistId: 1,
        videoIds: ['video1', 'video2', 'video3'],
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('insert_playlist_videos', {
        p_playlist_id: 1,
        p_video_ids: ['video1', 'video2', 'video3'],
        p_user_id: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should handle add videos errors', async () => {
      const mockError = { message: 'Videos already in playlist', code: '409' };
      (mockNeon.rpc as any).mockResolvedValue({
        error: mockError,
      });

      const result = await addVideosToPlaylist({
        playlistId: 2,
        videoIds: ['video4'],
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('updatePlaylistVideoPosition', () => {
    it('should update video positions successfully', async () => {
      (mockNeon.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await updatePlaylistVideoPosition({
        playlistId: 1,
        videoIds: ['video1', 'video2'],
        position: 3,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith(
        'update_playlist_videos_positions',
        {
          p_playlist_id: 1,
          p_video_ids: ['video1', 'video2'],
          p_new_position: 3,
          p_user_id: 'test-user-id',
        }
      );
      expect(result.error).toBeNull();
    });

    it('should handle position update errors', async () => {
      const mockError = { message: 'Invalid position', code: '400' };
      (mockNeon.rpc as any).mockResolvedValue({
        error: mockError,
      });

      const result = await updatePlaylistVideoPosition({
        playlistId: 1,
        videoIds: ['video1'],
        position: -1,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('deleteVideosFromPlaylist', () => {
    it('should delete videos from playlist successfully', async () => {
      const mockDeleteData = [
        { video_id: 'video1', deleted: true },
        { video_id: 'video2', deleted: true },
      ];

      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: mockDeleteData,
          error: null,
        }),
      });

      const result = await deleteVideosFromPlaylist({
        playlistId: 1,
        videoIds: ['video1', 'video2'],
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('delete_playlist_videos', {
        p_playlist_id: 1,
        p_video_ids: ['video1', 'video2'],
        p_user_id: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should handle delete videos errors', async () => {
      const mockError = {
        message: 'Videos not found in playlist',
        code: '404',
      };

      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await deleteVideosFromPlaylist({
        playlistId: 1,
        videoIds: ['nonexistent'],
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('updatePlaylistInfo', () => {
    it('should update playlist info successfully', async () => {
      const mockUpdatedPlaylist = {
        id: 1,
        name: 'Updated Playlist',
        description: 'Updated description',
        type: 'Public',
        image_properties: { crop: { x: 0, y: 0, width: 100, height: 100 } },
      };

      const mockTable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockUpdatedPlaylist,
          error: null,
        }),
      };

      (mockNeon.from as any).mockReturnValue(mockTable);

      const result = await updatePlaylistInfo({
        playlistId: 1,
        name: 'Updated Playlist',
        description: 'Updated description',
        type: 'Public',
        imageProperties: { x: 0, y: 0, width: 100, height: 100 },
        neon: mockNeon,
      });

      expect(mockNeon.from).toHaveBeenCalledWith('playlists');
      expect(mockTable.update).toHaveBeenCalledWith({
        name: 'Updated Playlist',
        description: 'Updated description',
        image_properties: { x: 0, y: 0, width: 100, height: 100 },
        type: 'Public',
      });
      expect(mockTable.eq).toHaveBeenCalledWith('id', 1);
      expect(result.updatedPlaylist).toEqual(mockUpdatedPlaylist);
      expect(result.error).toBeNull();
    });

    it('should trim whitespace from name and description', async () => {
      const mockTable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
      };

      (mockNeon.from as any).mockReturnValue(mockTable);

      await updatePlaylistInfo({
        playlistId: 1,
        name: '  Trimmed Name  ',
        description: '  Trimmed Description  ',
        type: 'Private',
        imageProperties: null,
        neon: mockNeon,
      });

      expect(mockTable.update).toHaveBeenCalledWith({
        name: 'Trimmed Name',
        description: 'Trimmed Description',
        image_properties: null,
        type: 'Private',
      });
    });

    it('should handle update errors', async () => {
      const mockError = { message: 'Update failed', code: '400' };
      const mockTable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      (mockNeon.from as any).mockReturnValue(mockTable);

      const result = await updatePlaylistInfo({
        playlistId: 1,
        name: 'Test',
        description: null,
        type: 'Public',
        imageProperties: null,
        neon: mockNeon,
      });

      expect(result.updatedPlaylist).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });

  describe('updatePlaylistThumbnail', () => {
    it('should update playlist thumbnail successfully', async () => {
      (mockNeon.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await updatePlaylistThumbnail({
        playlistId: 1,
        thumbnailUrl: 'path/to/new/thumbnail.webp',
        imageProperties: {
          x: 10,
          y: 20,
          width: 200,
          height: 150,
        },
        neon: mockNeon,
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('update_playlist_thumbnail', {
        p_playlist_id: 1,
        p_thumbnail_url: 'path/to/new/thumbnail.webp',
        p_image_properties: { x: 10, y: 20, width: 200, height: 150 },
      });
      expect(result.error).toBeNull();
    });

    it('should reset image when thumbnailUrl is null', async () => {
      const mockTable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (mockNeon.from as any).mockReturnValue(mockTable);

      const result = await updatePlaylistThumbnail({
        playlistId: 1,
        thumbnailUrl: null,
        imageProperties: null,
        neon: mockNeon,
      });

      expect(mockNeon.from).toHaveBeenCalledWith('playlists');
      expect(mockTable.update).toHaveBeenCalledWith({
        thumbnail_url: null,
        image_webp_url: null,
        image_avif_url: null,
        image_properties: null,
        image_processing_status: null,
        image_processing_updated_at: null,
      });
      expect(result.error).toBeNull();
    });

    it('should handle thumbnail update errors', async () => {
      const mockError = { message: 'Thumbnail update failed', code: '500' };
      (mockNeon.rpc as any).mockResolvedValue({
        error: mockError,
      });

      const result = await updatePlaylistThumbnail({
        playlistId: 1,
        thumbnailUrl: 'path/to/thumbnail.jpg',
        imageProperties: null,
        neon: mockNeon,
      });

      expect(result.error).toEqual(mockError);
      expect(result.updatedPlaylist).toBeNull();
    });
  });

  describe('followPlaylist', () => {
    it('should follow playlist successfully', async () => {
      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ followed: true }],
          error: null,
        }),
      });

      const result = await followPlaylist({
        playlistId: 1,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('follow_playlist', {
        p_playlist_id: 1,
        p_user_id: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should follow playlist without position', async () => {
      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ followed: true }],
          error: null,
        }),
      });

      await followPlaylist({
        playlistId: 2,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('follow_playlist', {
        p_playlist_id: 2,
        p_user_id: 'test-user-id',
      });
    });

    it('should handle follow errors', async () => {
      const mockError = { message: 'Already following', code: '409' };
      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await followPlaylist({
        playlistId: 1,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('unfollowPlaylist', () => {
    it('should unfollow playlist successfully', async () => {
      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ unfollowed: true }],
          error: null,
        }),
      });

      const result = await unfollowPlaylist({
        playlistId: 1,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(mockNeon.rpc).toHaveBeenCalledWith('unfollow_playlist', {
        p_playlist_id: 1,
        p_user_id: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should handle unfollow errors', async () => {
      const mockError = { message: 'Not following playlist', code: '404' };
      (mockNeon.rpc as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await unfollowPlaylist({
        playlistId: 1,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('updatePlaylistSort', () => {
    it('should update playlist sort successfully', async () => {
      const mockUpdatedPlaylist = {
        id: 1,
        sorted_by: 'views',
        sort_order: 'descending',
      };

      const mockTable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockUpdatedPlaylist,
          error: null,
        }),
      };

      (mockNeon.from as any).mockReturnValue(mockTable);

      const result = await updatePlaylistSort({
        playlistId: 1,
        sortedBy: 'title',
        sortOrder: 'descending',
        neon: mockNeon,
      });

      expect(mockNeon.from).toHaveBeenCalledWith('user_playlists');
      expect(mockTable.update).toHaveBeenCalledWith({
        sorted_by: 'title',
        sort_order: 'descending',
      });
      expect(mockTable.eq).toHaveBeenCalledWith('id', 1);
      expect(result.updatedPlaylist).toEqual(mockUpdatedPlaylist);
      expect(result.error).toBeNull();
    });

    it('should handle sort update errors', async () => {
      const mockError = { message: 'Sort update failed', code: '400' };
      const mockTable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      (mockNeon.from as any).mockReturnValue(mockTable);

      const result = await updatePlaylistSort({
        playlistId: 1,
        sortedBy: 'title',
        sortOrder: 'ascending',
        neon: mockNeon,
      });

      expect(result.updatedPlaylist).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });
});
