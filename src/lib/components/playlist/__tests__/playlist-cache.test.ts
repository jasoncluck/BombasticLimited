import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playlistCache } from '../playlist-cache';
import type { HighlightPlaylist } from '$lib/constants/source';
import type { Playlist } from '$lib/supabase/playlists';
import type { Video } from '$lib/supabase/videos';

describe('playlist cache module', () => {
  let mockNow: number;
  let dateNowSpy: any;

  beforeEach(() => {
    // Clear cache before each test
    playlistCache.clear();

    // Mock Date.now to have consistent timing
    mockNow = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(mockNow);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  const createMockHighlightedPlaylists = (): HighlightPlaylist[] => [
    { youtubeId: 'PL123', name: 'Playlist 1' },
    { youtubeId: 'PL456', name: 'Playlist 2' },
  ];

  const createMockCachedData = () => [
    {
      playlist: { id: 1, name: 'Test Playlist 1' } as Playlist,
      videos: [{ id: 'video1', title: 'Video 1' } as Video],
    },
    {
      playlist: { id: 2, name: 'Test Playlist 2' } as Playlist,
      videos: [{ id: 'video2', title: 'Video 2' } as Video],
    },
  ];

  describe('cache key generation', () => {
    it('should generate consistent cache keys for same input', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      // Set data twice with same parameters
      playlistCache.set(source, playlists, data);
      const firstResult = playlistCache.get(source, playlists);

      playlistCache.set(source, playlists, data);
      const secondResult = playlistCache.get(source, playlists);

      expect(firstResult).toEqual(secondResult);
      expect(firstResult).toEqual(data);
    });

    it('should generate different cache keys for different sources', () => {
      const playlists = createMockHighlightedPlaylists();
      const youtubeData = createMockCachedData();
      const twitchData = [
        {
          playlist: { id: 3, name: 'Twitch Playlist' } as Playlist,
          videos: [{ id: 'video3', title: 'Twitch Video' } as Video],
        },
      ];

      playlistCache.set('youtube', playlists, youtubeData);
      playlistCache.set('twitch', playlists, twitchData);

      const youtubeResult = playlistCache.get('youtube', playlists);
      const twitchResult = playlistCache.get('twitch', playlists);

      expect(youtubeResult).toEqual(youtubeData);
      expect(twitchResult).toEqual(twitchData);
      expect(youtubeResult).not.toEqual(twitchResult);
    });

    it('should generate different cache keys for different playlist sets', () => {
      const source = 'youtube';
      const playlists1 = [{ youtubeId: 'PL123', name: 'Playlist 1' }];
      const playlists2 = [{ youtubeId: 'PL456', name: 'Playlist 2' }];
      const data1 = [createMockCachedData()[0]];
      const data2 = [createMockCachedData()[1]];

      playlistCache.set(source, playlists1, data1);
      playlistCache.set(source, playlists2, data2);

      const result1 = playlistCache.get(source, playlists1);
      const result2 = playlistCache.get(source, playlists2);

      expect(result1).toEqual(data1);
      expect(result2).toEqual(data2);
      expect(result1).not.toEqual(result2);
    });

    it('should sort playlist IDs to ensure consistent keys', () => {
      const source = 'youtube';
      const playlists1 = [
        { youtubeId: 'PL123', name: 'Playlist 1' },
        { youtubeId: 'PL456', name: 'Playlist 2' },
      ];
      const playlists2 = [
        { youtubeId: 'PL456', name: 'Playlist 2' },
        { youtubeId: 'PL123', name: 'Playlist 1' },
      ];
      const data = createMockCachedData();

      playlistCache.set(source, playlists1, data);
      const result = playlistCache.get(source, playlists2);

      expect(result).toEqual(data);
    });
  });

  describe('cache operations', () => {
    it('should store and retrieve data successfully', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);
      const result = playlistCache.get(source, playlists);

      expect(result).toEqual(data);
    });

    it('should return null for non-existent cache entries', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();

      const result = playlistCache.get(source, playlists);

      expect(result).toBeNull();
    });

    it('should clear all cache entries', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);
      expect(playlistCache.get(source, playlists)).toEqual(data);

      playlistCache.clear();
      expect(playlistCache.get(source, playlists)).toBeNull();
    });

    it('should handle empty playlist arrays', () => {
      const source = 'youtube';
      const playlists: HighlightPlaylist[] = [];
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);
      const result = playlistCache.get(source, playlists);

      expect(result).toEqual(data);
    });

    it('should handle empty data arrays', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data: any[] = [];

      playlistCache.set(source, playlists, data);
      const result = playlistCache.get(source, playlists);

      expect(result).toEqual(data);
    });
  });

  describe('cache expiration', () => {
    it('should return cached data within expiration time', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);

      // Advance time by 1 minute (less than 2 minute expiry)
      mockNow += 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      const result = playlistCache.get(source, playlists);
      expect(result).toEqual(data);
    });

    it('should return null for expired cache entries', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);

      // Advance time by 3 minutes (more than 2 minute expiry)
      mockNow += 3 * 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      const result = playlistCache.get(source, playlists);
      expect(result).toBeNull();
    });

    it('should delete expired entries when accessed', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);

      // Advance time to expire the cache
      mockNow += 3 * 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      // First get should return null and delete the entry
      const firstResult = playlistCache.get(source, playlists);
      expect(firstResult).toBeNull();

      // Reset time to earlier and try again - should still be null
      mockNow -= 2 * 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      const secondResult = playlistCache.get(source, playlists);
      expect(secondResult).toBeNull();
    });
  });

  describe('cache cleanup', () => {
    it('should remove expired entries during cleanup', () => {
      const source = 'youtube';
      const playlists1 = [{ youtubeId: 'PL123', name: 'Playlist 1' }];
      const playlists2 = [{ youtubeId: 'PL456', name: 'Playlist 2' }];
      const data1 = [createMockCachedData()[0]];
      const data2 = [createMockCachedData()[1]];

      // Set two cache entries
      playlistCache.set(source, playlists1, data1);

      // Advance time by 1 minute
      mockNow += 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      // Set second entry (this one should not expire)
      playlistCache.set(source, playlists2, data2);

      // Advance time by 2 more minutes (first entry expires, second doesn't)
      mockNow += 2 * 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      // Run cleanup
      playlistCache.cleanup();

      // First entry should be gone, second should remain
      expect(playlistCache.get(source, playlists1)).toBeNull();
      expect(playlistCache.get(source, playlists2)).toEqual(data2);
    });

    it('should not remove non-expired entries during cleanup', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);

      // Advance time by 1 minute (not expired)
      mockNow += 60 * 1000;
      dateNowSpy.mockReturnValue(mockNow);

      playlistCache.cleanup();

      const result = playlistCache.get(source, playlists);
      expect(result).toEqual(data);
    });

    it('should handle cleanup when cache is empty', () => {
      // Should not throw when cleaning empty cache
      expect(() => playlistCache.cleanup()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle playlists with special characters in IDs', () => {
      const source = 'youtube';
      const playlists = [{ youtubeId: 'PL-123_456', name: 'Special Playlist' }];
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);
      const result = playlistCache.get(source, playlists);

      expect(result).toEqual(data);
    });

    it('should handle very long playlist ID lists', () => {
      const source = 'youtube';
      const playlists = Array.from({ length: 100 }, (_, i) => ({
        youtubeId: `PL${i.toString().padStart(5, '0')}`,
        name: `Playlist ${i}`,
      }));
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);
      const result = playlistCache.get(source, playlists);

      expect(result).toEqual(data);
    });

    it('should handle duplicate playlist IDs', () => {
      const source = 'youtube';
      const playlists = [
        { youtubeId: 'PL123', name: 'Playlist 1' },
        { youtubeId: 'PL123', name: 'Playlist 1 Duplicate' },
      ];
      const data = createMockCachedData();

      playlistCache.set(source, playlists, data);
      const result = playlistCache.get(source, playlists);

      expect(result).toEqual(data);
    });

    it('should overwrite existing cache entries', () => {
      const source = 'youtube';
      const playlists = createMockHighlightedPlaylists();
      const data1 = createMockCachedData();
      const data2 = [
        {
          playlist: { id: 99, name: 'Updated Playlist' } as Playlist,
          videos: [{ id: 'updated-video', title: 'Updated Video' } as Video],
        },
      ];

      playlistCache.set(source, playlists, data1);
      expect(playlistCache.get(source, playlists)).toEqual(data1);

      playlistCache.set(source, playlists, data2);
      expect(playlistCache.get(source, playlists)).toEqual(data2);
    });
  });
});
