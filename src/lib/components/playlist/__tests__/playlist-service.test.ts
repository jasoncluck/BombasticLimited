import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCreatePlaylist,
  handleDeletePlaylist,
  handleAddVideosToPlaylist,
  handleRemoveVideosFromPlaylist,
  handleUpdatePlaylistImage,
  handleUpdatePlaylistVideoPosition,
  handleUpdatePlaylistPosition,
  handleFollowPlaylist,
  handleUnfollowPlaylist,
  handleUpdatePlaylistSort,
} from '../playlist-service';
import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import type { AppSession as Session } from '$lib/types/session';
import type { Database } from '$lib/neon/database.types';

// Mock modules
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('$lib/neon/notifications', () => ({
  showNotification: vi.fn(),
}));

vi.mock('$lib/neon/playlists', () => ({
  createPlaylist: vi.fn().mockResolvedValue({ playlist: null, error: null }),
  deletePlaylist: vi.fn().mockResolvedValue({ error: null }),
  addVideosToPlaylist: vi.fn().mockResolvedValue({ error: null }),
  deleteVideosFromPlaylist: vi.fn().mockResolvedValue({ error: null }),
  updatePlaylistThumbnail: vi.fn().mockResolvedValue({ error: null }),
  updatePlaylistPosition: vi.fn().mockResolvedValue({ error: null }),
  updatePlaylistSort: vi
    .fn()
    .mockResolvedValue({ updatedPlaylist: null, error: null }),
  updatePlaylistVideoPosition: vi.fn().mockResolvedValue({ error: null }),
  followPlaylist: vi.fn().mockResolvedValue({ error: null }),
  unfollowPlaylist: vi.fn().mockResolvedValue({ error: null }),
  PLAYLIST_VIDEO_LIMIT: 500,
  USER_PLAYLIST_LIMIT: 25,
}));

vi.mock('$lib/state/notifications.svelte', () => ({
  showToast: vi.fn(),
}));

describe('playlist service module', () => {
  let mockNeon: NeonPostgrestClient<Database>;
  let mockSession: Session;
  let mockSidebarState: any;

  beforeEach(() => {
    mockNeon = {} as any;
    mockSession = {
      user: { id: 'user123' },
    } as any;
    mockSidebarState = {
      refreshData: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe('handleCreatePlaylist', () => {
    it('should create playlist successfully', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const { createPlaylist } = await import('$lib/neon/playlists');
      const { showToast } = await import('$lib/state/notifications.svelte');
      (createPlaylist as any).mockResolvedValue({
        playlist: mockPlaylist,
        error: null,
      });

      const result = await handleCreatePlaylist({
        sidebarState: mockSidebarState,
        session: mockSession,
        neon: mockNeon,
      });

      expect(createPlaylist).toHaveBeenCalledWith({
        neon: mockNeon,
        userId: 'user123',
      });
      expect(showToast).toHaveBeenCalledWith('Created Playlist: Test Playlist');
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
      expect(result.playlist).toEqual(mockPlaylist);
      expect(result.error).toBeNull();
    });

    it('should handle creation errors with playlist limit', async () => {
      const mockError = { code: 'P0001', message: 'Playlist limit exceeded' };
      const { createPlaylist } = await import('$lib/neon/playlists');
      const { showToast } = await import('$lib/state/notifications.svelte');
      (createPlaylist as any).mockResolvedValue({
        playlist: null,
        error: mockError,
      });

      const result = await handleCreatePlaylist({
        sidebarState: mockSidebarState,
        session: mockSession,
        neon: mockNeon,
      });

      expect(showToast).toHaveBeenCalledWith(
        'Unable to create playlist, a maximum of 25 playlists can be created or followed.',
        'error'
      );
      expect(result.error).toEqual(mockError);
    });

    it('should redirect to login when session is null', async () => {
      const { goto } = await import('$app/navigation');

      await expect(
        handleCreatePlaylist({
          sidebarState: mockSidebarState,
          session: null,
          neon: mockNeon,
        })
      ).rejects.toThrow(
        'Attempted to create a playlist without a valid session.'
      );

      expect(goto).toHaveBeenCalledWith('/login');
    });
  });

  describe('handleDeletePlaylist', () => {
    it('should delete playlist successfully', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const { deletePlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (deletePlaylist as any).mockResolvedValue({ error: null });

      const result = await handleDeletePlaylist({
        session: mockSession,
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
      });

      expect(deletePlaylist).toHaveBeenCalledWith({
        playlistId: 1,
        neon: mockNeon,
        userId: 'user123',
      });
      expect(showNotification).toHaveBeenCalledWith(
        'Deleted Test Playlist.',
        'success'
      );
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
      expect(result?.error).toBeNull();
    });

    it('should handle deletion errors', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const mockError = { message: 'Database error', code: '500' };
      const { deletePlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (deletePlaylist as any).mockResolvedValue({ error: mockError });

      const result = await handleDeletePlaylist({
        session: mockSession,
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to delete playlist: Test Playlist.',
        'error'
      );
      expect(result?.error).toEqual(mockError);
    });

    it('should redirect to login when user ID is missing', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const { goto } = await import('$app/navigation');

      const result = await handleDeletePlaylist({
        session: { user: {} } as any,
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
      });

      expect(goto).toHaveBeenCalledWith('/login');
      expect(result).toBeUndefined();
    });
  });

  describe('handleAddVideosToPlaylist', () => {
    it('should add videos to playlist successfully', async () => {
      const mockPlaylist = {
        id: 1,
        name: 'Test Playlist',
        created_by: 'user123',
        image_url: 'existing-thumbnail.jpg',
      };
      const mockVideos = [
        { id: 'video1', thumbnail_url: 'thumb1.jpg' },
        { id: 'video2', thumbnail_url: 'thumb2.jpg' },
      ];
      const { addVideosToPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      const { invalidate } = await import('$app/navigation');
      (addVideosToPlaylist as any).mockResolvedValue({ error: null });

      const result = await handleAddVideosToPlaylist({
        playlist: mockPlaylist as any,
        videos: mockVideos as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(addVideosToPlaylist).toHaveBeenCalledWith({
        videoIds: ['video1', 'video2'],
        playlistId: 1,
        neon: mockNeon,
        userId: 'user123',
      });
      expect(showNotification).toHaveBeenCalledWith(
        'Added videos to Test Playlist'
      );
      expect(invalidate).toHaveBeenCalledWith('neon:db:videos');
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
      expect(result.error).toBeNull();
    });

    it('should set thumbnail for playlist without image', async () => {
      const mockPlaylist = {
        id: 1,
        name: 'Test Playlist',
        created_by: 'user123',
        image_url: null, // No existing image
      };
      const mockVideos = [{ id: 'video1', thumbnail_url: 'thumb1.jpg' }];
      const { addVideosToPlaylist, updatePlaylistThumbnail } =
        await import('$lib/neon/playlists');
      (addVideosToPlaylist as any).mockResolvedValue({ error: null });
      (updatePlaylistThumbnail as any).mockResolvedValue({ error: null });

      await handleAddVideosToPlaylist({
        playlist: mockPlaylist as any,
        videos: mockVideos as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(updatePlaylistThumbnail).toHaveBeenCalledWith({
        playlistId: 1,
        thumbnailUrl: 'thumb1.jpg',
        imageProperties: null,
        neon: mockNeon,
      });
    });

    it('should handle video limit errors', async () => {
      const mockPlaylist = {
        id: 1,
        name: 'Test Playlist',
        created_by: 'user123',
      };
      const mockVideos = [{ id: 'video1' }];
      const mockError = { code: 'P0001', message: 'Video limit exceeded' };
      const { addVideosToPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (addVideosToPlaylist as any).mockResolvedValue({ error: mockError });

      const result = await handleAddVideosToPlaylist({
        playlist: mockPlaylist as any,
        videos: mockVideos as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Video could not be added. Playlists can not contain more than 500 videos.'
      );
      expect(result.error).toEqual(mockError);
    });

    it('should redirect when session is null', async () => {
      const { goto } = await import('$app/navigation');

      const result = await handleAddVideosToPlaylist({
        playlist: {} as any,
        videos: [] as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: null,
      });

      expect(goto).toHaveBeenCalledWith('/auth');
      expect(result.error).toBeNull();
    });

    it('should return early when user is not playlist owner', async () => {
      const mockPlaylist = {
        id: 1,
        created_by: 'different-user',
      };

      const result = await handleAddVideosToPlaylist({
        playlist: mockPlaylist as any,
        videos: [] as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(result.error).toBeNull();
    });
  });

  describe('handleRemoveVideosFromPlaylist', () => {
    it('should remove videos from playlist successfully', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const mockVideos = [{ id: 'video1' }, { id: 'video2' }];
      const { deleteVideosFromPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      const { invalidate } = await import('$app/navigation');
      (deleteVideosFromPlaylist as any).mockResolvedValue({ error: null });

      const result = await handleRemoveVideosFromPlaylist({
        videos: mockVideos as any,
        sidebarState: mockSidebarState,
        playlist: mockPlaylist as any,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(deleteVideosFromPlaylist).toHaveBeenCalledWith({
        videoIds: ['video1', 'video2'],
        playlistId: 1,
        neon: mockNeon,
        userId: 'test-user-id',
      });
      expect(showNotification).toHaveBeenCalledWith(
        'Removed video from Test Playlist.'
      );
      expect(invalidate).toHaveBeenCalledWith('neon:db:videos');
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
      expect(result.error).toBeNull();
    });

    it('should handle removal errors', async () => {
      const mockError = { message: 'Database error', code: '500' };
      const { deleteVideosFromPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (deleteVideosFromPlaylist as any).mockResolvedValue({
        error: mockError,
      });

      const result = await handleRemoveVideosFromPlaylist({
        videos: [] as any,
        sidebarState: mockSidebarState,
        playlist: {} as any,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to remove video from playlist.'
      );
      expect(result.error).toEqual(mockError);
    });
  });

  describe('handleUpdatePlaylistImage', () => {
    it('should update playlist image successfully', async () => {
      const mockPlaylist = { id: 1 };
      const { updatePlaylistThumbnail } = await import('$lib/neon/playlists');
      const { invalidate } = await import('$app/navigation');
      (updatePlaylistThumbnail as any).mockResolvedValue({ error: null });

      const result = await handleUpdatePlaylistImage({
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        thumbnailUrl: 'new-thumbnail.jpg',
        imageProperties: { x: 0, y: 0, width: 100, height: 100 },
        neon: mockNeon,
      });

      expect(updatePlaylistThumbnail).toHaveBeenCalledWith({
        playlistId: 1,
        thumbnailUrl: 'new-thumbnail.jpg',
        imageProperties: { x: 0, y: 0, width: 100, height: 100 },
        neon: mockNeon,
      });
      expect(invalidate).toHaveBeenCalledWith('neon:db:videos');
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
      expect(result.error).toBeNull();
    });

    it('should handle image update errors', async () => {
      const mockError = { message: 'Image update failed', code: '500' };
      const { updatePlaylistThumbnail } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (updatePlaylistThumbnail as any).mockResolvedValue({
        error: mockError,
      });

      const result = await handleUpdatePlaylistImage({
        playlist: {} as any,
        sidebarState: mockSidebarState,
        thumbnailUrl: null,
        neon: mockNeon,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable update playlist image'
      );
      expect(result.error).toEqual(mockError);
    });
  });

  describe('handleUpdatePlaylistVideoPosition', () => {
    it('should update video position successfully', async () => {
      const mockPlaylist = { id: 1 };
      const mockVideos = [{ id: 'video1' }];
      const { updatePlaylistVideoPosition } =
        await import('$lib/neon/playlists');
      (updatePlaylistVideoPosition as any).mockResolvedValue({ error: null });

      const result = await handleUpdatePlaylistVideoPosition({
        playlist: mockPlaylist as any,
        position: 5,
        videos: mockVideos as any,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(updatePlaylistVideoPosition).toHaveBeenCalledWith({
        playlistId: 1,
        position: 5,
        videoIds: ['video1'],
        neon: mockNeon,
        userId: 'test-user-id',
      });
      expect(result.error).toBeNull();
    });

    it('should handle position update errors', async () => {
      const mockError = { message: 'Position update failed', code: '500' };
      const { updatePlaylistVideoPosition } =
        await import('$lib/neon/playlists');
      (updatePlaylistVideoPosition as any).mockResolvedValue({
        error: mockError,
      });

      const result = await handleUpdatePlaylistVideoPosition({
        playlist: {} as any,
        position: 1,
        videos: [] as any,
        neon: mockNeon,
        userId: 'test-user-id',
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('handleUpdatePlaylistPosition', () => {
    it('should update playlist position successfully', async () => {
      const mockPlaylist = { id: 1 };
      const { updatePlaylistPosition } = await import('$lib/neon/playlists');
      (updatePlaylistPosition as any).mockResolvedValue({ error: null });

      await handleUpdatePlaylistPosition({
        playlist: mockPlaylist as any,
        position: 3,
        neon: mockNeon,
        session: mockSession,
      });

      expect(updatePlaylistPosition).toHaveBeenCalledWith({
        playlistId: 1,
        position: 3,
        neon: mockNeon,
        userId: 'user123',
      });
    });

    it('should redirect when session is null', async () => {
      const { goto } = await import('$app/navigation');

      await handleUpdatePlaylistPosition({
        playlist: {} as any,
        position: 1,
        neon: mockNeon,
        session: null,
      });

      expect(goto).toHaveBeenCalledWith('/auth');
    });
  });

  describe('handleFollowPlaylist', () => {
    it('should follow playlist successfully', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const mockContentFilter = {
        type: 'playlist' as const,
        sort: { key: 'title' as const, order: 'ascending' as const },
      };
      const { followPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (followPlaylist as any).mockResolvedValue({ error: null });

      await handleFollowPlaylist({
        playlist: mockPlaylist as any,
        position: 1,
        sidebarState: mockSidebarState,
        contentFilter: mockContentFilter,
        neon: mockNeon,
        session: mockSession,
      });

      expect(followPlaylist).toHaveBeenCalledWith({
        playlistId: 1,
        neon: mockNeon,
        userId: 'user123',
      });
      expect(showNotification).toHaveBeenCalledWith(
        'Followed playlist: Test Playlist ',
        'success'
      );
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
    });

    it('should handle follow errors with playlist limit', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const mockError = { code: 'P0001', message: 'Playlist limit exceeded' };
      const { followPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (followPlaylist as any).mockResolvedValue({ error: mockError });

      await handleFollowPlaylist({
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        contentFilter: {
          type: 'playlist' as const,
          sort: { key: 'title' as const, order: 'ascending' as const },
        },
        neon: mockNeon,
        session: mockSession,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to follow playlist, a maximum of 25 playlists can be followed or created.',
        'error'
      );
    });

    it('should redirect when session is null', async () => {
      const { goto } = await import('$app/navigation');

      await handleFollowPlaylist({
        playlist: {} as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: null,
      });

      expect(goto).toHaveBeenCalledWith('/auth');
    });

    it('should return early when content filter is missing', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await handleFollowPlaylist({
        playlist: {} as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unable to follow playlist, missing content filter.'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleUnfollowPlaylist', () => {
    it('should unfollow playlist successfully', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const { unfollowPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (unfollowPlaylist as any).mockResolvedValue({ error: null });

      const result = await handleUnfollowPlaylist({
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(unfollowPlaylist).toHaveBeenCalledWith({
        playlistId: 1,
        neon: mockNeon,
        userId: 'user123',
      });
      expect(showNotification).toHaveBeenCalledWith(
        'Unfollowed playlist: Test Playlist ',
        'success'
      );
      expect(mockSidebarState.refreshData).toHaveBeenCalled();
      expect(result?.error).toBeNull();
    });

    it('should handle unfollow errors', async () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' };
      const mockError = { message: 'Database error', code: '500' };
      const { unfollowPlaylist } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (unfollowPlaylist as any).mockResolvedValue({ error: mockError });

      const result = await handleUnfollowPlaylist({
        playlist: mockPlaylist as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: mockSession,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to unfollow playlist: Database error',
        'error'
      );
      expect(result?.error).toEqual(mockError);
    });

    it('should redirect when session is null', async () => {
      const { goto } = await import('$app/navigation');

      await handleUnfollowPlaylist({
        playlist: {} as any,
        sidebarState: mockSidebarState,
        neon: mockNeon,
        session: null,
      });

      expect(goto).toHaveBeenCalledWith('/auth');
    });
  });

  describe('handleUpdatePlaylistSort', () => {
    it('should update playlist sort successfully', async () => {
      const mockPlaylist = { id: 1 };
      const mockUpdatedPlaylist = { id: 1, sorted_by: 'title' };
      const { updatePlaylistSort } = await import('$lib/neon/playlists');
      (updatePlaylistSort as any).mockResolvedValue({
        updatedPlaylist: mockUpdatedPlaylist,
        error: null,
      });

      const result = await handleUpdatePlaylistSort({
        playlist: mockPlaylist as any,
        sortedBy: 'title',
        sortOrder: 'ascending',
        neon: mockNeon,
        session: mockSession,
      });

      expect(updatePlaylistSort).toHaveBeenCalledWith({
        playlistId: 1,
        sortedBy: 'title',
        sortOrder: 'ascending',
        neon: mockNeon,
      });
      expect(result?.updatedPlaylist).toEqual(mockUpdatedPlaylist);
      expect(result?.error).toBeNull();
    });

    it('should handle sort update errors', async () => {
      const mockError = { message: 'Sort update failed', code: '500' };
      const { updatePlaylistSort } = await import('$lib/neon/playlists');
      const { showNotification } = await import('$lib/neon/notifications');
      (updatePlaylistSort as any).mockResolvedValue({
        updatedPlaylist: null,
        error: mockError,
      });

      const result = await handleUpdatePlaylistSort({
        playlist: {} as any,
        sortedBy: 'title',
        sortOrder: 'ascending',
        neon: mockNeon,
        session: mockSession,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to update playlist sort settings',
        'error'
      );
      expect(result?.error).toEqual(mockError);
    });

    it('should redirect when session is null', async () => {
      const { goto } = await import('$app/navigation');

      await handleUpdatePlaylistSort({
        playlist: {} as any,
        sortedBy: 'title',
        sortOrder: 'ascending',
        neon: mockNeon,
        session: null,
      });

      expect(goto).toHaveBeenCalledWith('/auth');
    });
  });
});
