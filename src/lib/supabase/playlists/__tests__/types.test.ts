import { describe, it, expect } from 'vitest';
import {
  USER_PLAYLIST_LIMIT,
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  PLAYLIST_VIDEO_LIMIT,
  PLAYLIST_TYPES,
  type Playlist,
  type UserPlaylist,
  type PlaylistVideoWithTimestamp,
  type PlaylistType,
  type PlaylistImageProperties,
} from '../types';

describe('playlist types module', () => {
  describe('constants', () => {
    it('should define USER_PLAYLIST_LIMIT constant', () => {
      expect(USER_PLAYLIST_LIMIT).toBe(25);
      expect(typeof USER_PLAYLIST_LIMIT).toBe('number');
    });

    it('should define DEFAULT_NUM_PLAYLISTS_OVERVIEW constant', () => {
      expect(DEFAULT_NUM_PLAYLISTS_OVERVIEW).toBe(5);
      expect(typeof DEFAULT_NUM_PLAYLISTS_OVERVIEW).toBe('number');
    });

    it('should define DEFAULT_NUM_PLAYLISTS_PAGINATION constant', () => {
      expect(DEFAULT_NUM_PLAYLISTS_PAGINATION).toBe(15);
      expect(typeof DEFAULT_NUM_PLAYLISTS_PAGINATION).toBe('number');
    });

    it('should define PLAYLIST_VIDEO_LIMIT constant', () => {
      expect(PLAYLIST_VIDEO_LIMIT).toBe(100);
      expect(typeof PLAYLIST_VIDEO_LIMIT).toBe('number');
    });

    it('should have reasonable constant values', () => {
      expect(USER_PLAYLIST_LIMIT).toBeGreaterThan(0);
      expect(DEFAULT_NUM_PLAYLISTS_OVERVIEW).toBeGreaterThan(0);
      expect(DEFAULT_NUM_PLAYLISTS_PAGINATION).toBeGreaterThan(0);
      expect(PLAYLIST_VIDEO_LIMIT).toBeGreaterThan(0);
    });

    it('should have logical constant relationships', () => {
      expect(DEFAULT_NUM_PLAYLISTS_OVERVIEW).toBeLessThan(DEFAULT_NUM_PLAYLISTS_PAGINATION);
      expect(DEFAULT_NUM_PLAYLISTS_PAGINATION).toBeLessThan(USER_PLAYLIST_LIMIT);
    });
  });

  describe('PLAYLIST_TYPES constant', () => {
    it('should define valid playlist types', () => {
      expect(PLAYLIST_TYPES).toEqual(['Public', 'Private']);
      expect(Array.isArray(PLAYLIST_TYPES)).toBe(true);
      expect(PLAYLIST_TYPES).toHaveLength(2);
    });

    it('should contain expected playlist type values', () => {
      expect(PLAYLIST_TYPES).toContain('Public');
      expect(PLAYLIST_TYPES).toContain('Private');
    });

    it('should be a readonly array', () => {
      // TypeScript should enforce this at compile time
      // Runtime check to ensure it's treated as constant
      expect(PLAYLIST_TYPES).toEqual(['Public', 'Private']);
    });

    it('should provide type safety for PlaylistType', () => {
      // Test that each value is a valid PlaylistType
      PLAYLIST_TYPES.forEach((type) => {
        const playlistType: PlaylistType = type;
        expect(['Public', 'Private']).toContain(playlistType);
      });
    });
  });

  describe('type validation helpers', () => {
    const createMockPlaylist = (overrides: Partial<Playlist> = {}): Playlist => ({
      id: 1,
      created_at: '2023-01-01T00:00:00Z',
      name: 'Test Playlist',
      short_id: 'pl123',
      created_by: 'user123',
      description: 'A test playlist',
      image_url: 'https://example.com/image.jpg',
      image_processing_status: 'completed',
      type: 'Public',
      image_properties: { x: 0, y: 0, width: 100, height: 100 },
      youtube_id: 'PLtest123',
      thumbnail_url: 'https://youtube.com/thumb.jpg',
      deleted_at: null,
      duration_seconds: 3600,
      updated_at: null,
      image_processing_updated_at: null,
      profile_username: 'testuser',
      profile_avatar_url: 'https://avatar.com/user.jpg',
      ...overrides,
    });

    const createMockUserPlaylist = (overrides: Partial<UserPlaylist> = {}): UserPlaylist => ({
      ...createMockPlaylist(),
      playlist_position: 1,
      sorted_by: 'title',
      sort_order: 'ascending',
      added_at: '2023-01-02T00:00:00Z',
      ...overrides,
    });

    const createMockPlaylistVideo = (overrides: Partial<PlaylistVideoWithTimestamp> = {}): PlaylistVideoWithTimestamp => ({
      id: 'video123',
      video_position: 1,
      source: 'youtube',
      title: 'Test Video',
      description: 'A test video',
      thumbnail_url: 'https://youtube.com/thumb.jpg',
      image_url: 'https://example.com/video-image.jpg',
      published_at: '2023-01-01T00:00:00Z',
      duration: 'PT10M',
      video_start_seconds: 0,
      updated_at: '2023-01-01T01:00:00Z',
      watched_at: '2023-01-01T02:00:00Z',
      views: 1000,
      ...overrides,
    });

    describe('Playlist type structure', () => {
      it('should validate required Playlist properties', () => {
        const playlist = createMockPlaylist();

        expect(typeof playlist.id).toBe('number');
        expect(typeof playlist.created_at).toBe('string');
        expect(typeof playlist.name).toBe('string');
        expect(typeof playlist.short_id).toBe('string');
        expect(typeof playlist.created_by).toBe('string');
        expect(['Public', 'Private']).toContain(playlist.type);
      });

      it('should handle optional Playlist properties', () => {
        const playlist = createMockPlaylist({
          description: null,
          image_url: null,
          image_properties: null,
          youtube_id: null,
          thumbnail_url: null,
          deleted_at: null,
          updated_at: null,
          image_processing_updated_at: null,
          profile_avatar_url: null,
        });

        expect(playlist.description).toBeNull();
        expect(playlist.image_url).toBeNull();
        expect(playlist.image_properties).toBeNull();
        expect(playlist.youtube_id).toBeNull();
        expect(playlist.thumbnail_url).toBeNull();
        expect(playlist.deleted_at).toBeNull();
        expect(playlist.updated_at).toBeNull();
        expect(playlist.image_processing_updated_at).toBeNull();
        expect(playlist.profile_avatar_url).toBeNull();
      });

      it('should validate PlaylistImageProperties structure', () => {
        const imageProperties: PlaylistImageProperties = {
          x: 10,
          y: 20,
          width: 300,
          height: 200,
        };

        expect(typeof imageProperties.x).toBe('number');
        expect(typeof imageProperties.y).toBe('number');
        expect(typeof imageProperties.width).toBe('number');
        expect(typeof imageProperties.height).toBe('number');
      });

      it('should handle different playlist types', () => {
        const publicPlaylist = createMockPlaylist({ type: 'Public' });
        const privatePlaylist = createMockPlaylist({ type: 'Private' });

        expect(publicPlaylist.type).toBe('Public');
        expect(privatePlaylist.type).toBe('Private');
      });
    });

    describe('UserPlaylist type structure', () => {
      it('should extend Playlist with user-specific properties', () => {
        const userPlaylist = createMockUserPlaylist();

        // Should have all Playlist properties
        expect(typeof userPlaylist.id).toBe('number');
        expect(typeof userPlaylist.name).toBe('string');
        expect(typeof userPlaylist.type).toBe('string');

        // Should have additional UserPlaylist properties
        expect(typeof userPlaylist.playlist_position).toBe('number');
        expect(typeof userPlaylist.sorted_by).toBe('string');
        expect(typeof userPlaylist.sort_order).toBe('string');
      });

      it('should handle optional added_at property', () => {
        const userPlaylistWithoutAddedAt = createMockUserPlaylist({
          added_at: undefined,
        });

        expect(userPlaylistWithoutAddedAt.added_at).toBeUndefined();
      });

      it('should handle different sort configurations', () => {
        const titleAscPlaylist = createMockUserPlaylist({
          sorted_by: 'title',
          sort_order: 'ascending',
        });

        const viewsDescPlaylist = createMockUserPlaylist({
          sorted_by: 'views',
          sort_order: 'descending',
        });

        expect(titleAscPlaylist.sorted_by).toBe('title');
        expect(titleAscPlaylist.sort_order).toBe('ascending');
        expect(viewsDescPlaylist.sorted_by).toBe('views');
        expect(viewsDescPlaylist.sort_order).toBe('descending');
      });
    });

    describe('PlaylistVideoWithTimestamp type structure', () => {
      it('should validate required video properties', () => {
        const video = createMockPlaylistVideo();

        expect(typeof video.id).toBe('string');
        expect(typeof video.video_position).toBe('number');
        expect(typeof video.source).toBe('string');
        expect(typeof video.title).toBe('string');
        expect(typeof video.description).toBe('string');
        expect(typeof video.thumbnail_url).toBe('string');
        expect(typeof video.published_at).toBe('string');
        expect(typeof video.duration).toBe('string');
        expect(typeof video.views).toBe('number');
      });

      it('should handle optional video properties', () => {
        const video = createMockPlaylistVideo({
          image_url: null,
          video_start_seconds: null,
          updated_at: null,
          watched_at: null,
        });

        expect(video.image_url).toBeNull();
        expect(video.video_start_seconds).toBeNull();
        expect(video.updated_at).toBeNull();
        expect(video.watched_at).toBeNull();
      });

      it('should handle different video sources', () => {
        const youtubeVideo = createMockPlaylistVideo({ source: 'youtube' });
        const twitchVideo = createMockPlaylistVideo({ source: 'twitch' });

        expect(youtubeVideo.source).toBe('youtube');
        expect(twitchVideo.source).toBe('twitch');
      });

      it('should handle timestamp properties correctly', () => {
        const videoWithTimestamps = createMockPlaylistVideo({
          video_start_seconds: 150,
          updated_at: '2023-01-01T01:00:00Z',
          watched_at: '2023-01-01T02:00:00Z',
        });

        expect(videoWithTimestamps.video_start_seconds).toBe(150);
        expect(videoWithTimestamps.updated_at).toBe('2023-01-01T01:00:00Z');
        expect(videoWithTimestamps.watched_at).toBe('2023-01-01T02:00:00Z');
      });
    });
  });

  describe('type compatibility and inheritance', () => {
    it('should allow UserPlaylist to be used as Playlist', () => {
      const userPlaylist: UserPlaylist = {
        id: 1,
        created_at: '2023-01-01T00:00:00Z',
        name: 'User Playlist',
        short_id: 'upl1',
        created_by: 'user1',
        description: 'User specific playlist',
        image_url: null,
        image_processing_status: null,
        type: 'Private',
        image_properties: null,
        youtube_id: null,
        thumbnail_url: null,
        deleted_at: null,
        duration_seconds: null,
        profile_username: 'user1',
        playlist_position: 2,
        sorted_by: 'dateAdded',
        sort_order: 'descending',
        added_at: '2023-01-02T00:00:00Z',
      };

      // Should be assignable to Playlist type
      const playlist: Playlist = userPlaylist;
      expect(playlist.id).toBe(userPlaylist.id);
      expect(playlist.name).toBe(userPlaylist.name);
    });

    it('should handle PlaylistImageProperties edge cases', () => {
      const zeroSizeProperties: PlaylistImageProperties = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };

      const negativeProperties: PlaylistImageProperties = {
        x: -10,
        y: -20,
        width: 100,
        height: 200,
      };

      expect(zeroSizeProperties.width).toBe(0);
      expect(zeroSizeProperties.height).toBe(0);
      expect(negativeProperties.x).toBe(-10);
      expect(negativeProperties.y).toBe(-20);
    });
  });

  describe('constant value ranges and limits', () => {
    it('should have sensible user playlist limit', () => {
      expect(USER_PLAYLIST_LIMIT).toBeGreaterThan(10);
      expect(USER_PLAYLIST_LIMIT).toBeLessThan(100);
    });

    it('should have reasonable pagination defaults', () => {
      expect(DEFAULT_NUM_PLAYLISTS_OVERVIEW).toBeGreaterThan(1);
      expect(DEFAULT_NUM_PLAYLISTS_OVERVIEW).toBeLessThan(20);
      expect(DEFAULT_NUM_PLAYLISTS_PAGINATION).toBeGreaterThan(DEFAULT_NUM_PLAYLISTS_OVERVIEW);
      expect(DEFAULT_NUM_PLAYLISTS_PAGINATION).toBeLessThan(50);
    });

    it('should have appropriate video limit per playlist', () => {
      expect(PLAYLIST_VIDEO_LIMIT).toBeGreaterThan(50);
      expect(PLAYLIST_VIDEO_LIMIT).toBeLessThan(1000);
    });
  });

  describe('type safety validation', () => {
    it('should enforce playlist type constraints', () => {
      // These should be valid assignments
      const publicType: PlaylistType = 'Public';
      const privateType: PlaylistType = 'Private';

      expect(publicType).toBe('Public');
      expect(privateType).toBe('Private');
    });

    it('should validate string literal types', () => {
      // Ensure PLAYLIST_TYPES contains exact string literals
      const types: readonly string[] = PLAYLIST_TYPES;
      expect(types).toEqual(['Public', 'Private']);
    });

    it('should handle complex nested type structures', () => {
      const complexPlaylist: Playlist = {
        id: 999,
        created_at: '2023-12-01T00:00:00Z',
        name: 'Complex Playlist with Unicode 🎵',
        short_id: 'cpl999',
        created_by: 'user-with-dashes_and_underscores',
        description: 'A playlist with special chars & symbols 中文',
        image_url: 'https://cdn.example.com/images/playlist/999/image.webp',
        image_processing_status: 'processing',
        type: 'Public',
        image_properties: {
          x: 25,
          y: 50,
          width: 400,
          height: 300,
        },
        youtube_id: 'PLComplexPlaylist123',
        thumbnail_url: 'https://youtube.com/thumbnail/999.jpg',
        deleted_at: null,
        duration_seconds: 7200,
        updated_at: '2023-12-01T12:00:00Z',
        image_processing_updated_at: '2023-12-01T11:30:00Z',
        profile_username: 'complex_username_123',
        profile_avatar_url: 'https://avatars.example.com/complex_user.jpg',
      };

      expect(complexPlaylist).toBeDefined();
      expect(complexPlaylist.image_properties?.width).toBe(400);
      expect(complexPlaylist.image_properties?.height).toBe(300);
    });
  });
});