import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateContentNavigationUrl,
  handleContentNavigation,
  getContentView,
  CONTENT_DISPLAY,
  TILES_DISPLAY,
} from '../content';

// Mock dependencies
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

vi.mock('./content-filter', () => ({
  getSortKeysForView: vi.fn(),
  isPlaylistVideosFilter: vi.fn(),
  isSortKey: vi.fn(),
  isSortOrder: vi.fn(),
}));

vi.mock('$lib/supabase/playlists', () => ({
  isUserPlaylist: vi.fn(),
}));

vi.mock('$lib/supabase/videos', () => ({
  isVideoWithPlaylistTimestamp: vi.fn(),
}));

// Mock global window.location
const mockLocation = {
  href: 'https://example.com/current-page',
  origin: 'https://example.com',
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('Content module', () => {
  let mockGoto: any;
  let mockGetSortKeysForView: any;
  let mockIsPlaylistVideosFilter: any;
  let mockIsSortKey: any;
  let mockIsSortOrder: any;
  let mockIsUserPlaylist: any;
  let mockIsVideoWithPlaylistTimestamp: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mocks
    const { goto } = require('$app/navigation');
    const {
      getSortKeysForView,
      isPlaylistVideosFilter,
      isSortKey,
      isSortOrder,
    } = require('./content-filter');
    const { isUserPlaylist } = require('$lib/supabase/playlists');
    const { isVideoWithPlaylistTimestamp } = require('$lib/supabase/videos');

    mockGoto = goto;
    mockGetSortKeysForView = getSortKeysForView;
    mockIsPlaylistVideosFilter = isPlaylistVideosFilter;
    mockIsSortKey = isSortKey;
    mockIsSortOrder = isSortOrder;
    mockIsUserPlaylist = isUserPlaylist;
    mockIsVideoWithPlaylistTimestamp = isVideoWithPlaylistTimestamp;

    // Default mock implementations
    mockGetSortKeysForView.mockReturnValue(['title', 'datePublished', 'playlistOrder']);
    mockIsPlaylistVideosFilter.mockReturnValue(false);
    mockIsSortKey.mockReturnValue(false);
    mockIsSortOrder.mockReturnValue(false);
    mockIsUserPlaylist.mockReturnValue(false);
    mockIsVideoWithPlaylistTimestamp.mockReturnValue(false);

    // Reset window.location
    window.location.href = 'https://example.com/current-page';
  });

  describe('constants', () => {
    it('should define CONTENT_DISPLAY constants', () => {
      expect(CONTENT_DISPLAY.CARD).toBe('TILES');
      expect(CONTENT_DISPLAY.TABLE).toBe('TABLE');
    });

    it('should define TILES_DISPLAY constants', () => {
      expect(TILES_DISPLAY.CAROUSEL).toBe('CAROUSEL');
      expect(TILES_DISPLAY.TILES).toBe('TILES');
    });
  });

  describe('generateContentNavigationUrl', () => {
    const mockVideo = {
      id: 'video-123',
      title: 'Test Video',
      source: 'giantbomb' as const,
      description: 'Test description',
      thumbnail_url: 'https://example.com/thumb.jpg',
      image_url: 'https://example.com/image.jpg',
      published_at: '2023-01-01T00:00:00Z',
      duration: '00:30:00',
      updated_at: '2023-01-01T00:00:00Z',
    };

    const mockContentFilter = {
      type: 'timestamp' as const,
      sort: {
        key: 'dateTimestamp' as const,
        order: 'descending' as const,
      },
    };

    it('should generate basic video URL', () => {
      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: mockContentFilter,
      });

      expect(url).toContain('/video/video-123');
      expect(mockGetSortKeysForView).toHaveBeenCalledWith('playlist');
    });

    it('should generate playlist video URL when playlist and filter are provided', () => {
      const mockPlaylist = { short_id: 'pl123' };
      const playlistFilter = {
        type: 'playlist' as const,
        sort: {
          key: 'title' as const,
          order: 'ascending' as const,
        },
      };

      mockIsPlaylistVideosFilter.mockReturnValue(true);

      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: playlistFilter,
        playlist: mockPlaylist as any,
      });

      expect(url).toContain('/playlist/pl123/video/video-123');
      expect(url).toContain('title=ascending');
    });

    it('should use user playlist sort settings', () => {
      const mockUserPlaylist = {
        short_id: 'pl456',
        sorted_by: 'datePublished',
        sort_order: 'descending',
      };

      mockIsUserPlaylist.mockReturnValue(true);
      mockIsSortKey.mockReturnValue(true);
      mockIsSortOrder.mockReturnValue(true);

      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: mockContentFilter,
        playlist: mockUserPlaylist as any,
      });

      expect(url).toContain('/playlist/pl456/video/video-123');
      expect(url).toContain('datePublished=descending');
    });

    it('should use video playlist timestamp when available', () => {
      const videoWithPlaylist = {
        ...mockVideo,
        playlist_short_id: 'pl789',
        playlist_sorted_by: 'playlistOrder',
        playlist_sort_order: 'ascending',
      };

      mockIsVideoWithPlaylistTimestamp.mockReturnValue(true);
      mockIsSortKey.mockReturnValue(true);
      mockIsSortOrder.mockReturnValue(true);

      const url = generateContentNavigationUrl({
        video: videoWithPlaylist as any,
        contentFilter: mockContentFilter,
      });

      expect(url).toContain('/playlist/pl789/video/video-123');
      expect(url).toContain('playlistOrder=ascending');
    });

    it('should use custom base URL', () => {
      const customBaseUrl = 'https://custom.com/path?existing=param';

      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: mockContentFilter,
        baseUrl: customBaseUrl,
      });

      expect(url).toContain('https://example.com'); // Uses origin
      expect(url).toContain('/video/video-123');
    });

    it('should preserve existing search parameters', () => {
      window.location.href = 'https://example.com/current?existing=value&other=param';

      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: mockContentFilter,
      });

      expect(url).toContain('existing=value');
      expect(url).toContain('other=param');
    });

    it('should remove old playlist sort keys', () => {
      mockGetSortKeysForView.mockReturnValue(['title', 'datePublished']);
      window.location.href = 'https://example.com/current?title=ascending&datePublished=descending';

      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: mockContentFilter,
      });

      // Should not contain the old sort parameters
      expect(url).not.toContain('title=ascending');
      expect(url).not.toContain('datePublished=descending');
    });

    it('should handle missing playlist sort settings gracefully', () => {
      const mockUserPlaylist = {
        short_id: 'pl456',
        sorted_by: null,
        sort_order: null,
      };

      mockIsUserPlaylist.mockReturnValue(true);
      mockIsSortKey.mockReturnValue(false); // Invalid sort key
      mockIsSortOrder.mockReturnValue(false); // Invalid sort order

      const url = generateContentNavigationUrl({
        video: mockVideo,
        contentFilter: mockContentFilter,
        playlist: mockUserPlaylist as any,
      });

      expect(url).toContain('/playlist/pl456/video/video-123');
      // Should not contain sort parameters
      expect(url).not.toContain('=ascending');
      expect(url).not.toContain('=descending');
    });

    it('should handle video with partial playlist timestamp data', () => {
      const videoWithPartialPlaylist = {
        ...mockVideo,
        playlist_short_id: 'pl789',
        playlist_sorted_by: null, // Missing sort data
        playlist_sort_order: 'ascending',
      };

      mockIsVideoWithPlaylistTimestamp.mockReturnValue(true);
      mockIsSortKey.mockReturnValue(false); // Invalid sort key

      const url = generateContentNavigationUrl({
        video: videoWithPartialPlaylist as any,
        contentFilter: mockContentFilter,
      });

      expect(url).toContain('/playlist/pl789/video/video-123');
      expect(url).not.toContain('=ascending');
    });
  });

  describe('handleContentNavigation', () => {
    const mockVideo = {
      id: 'video-456',
      title: 'Test Video',
      source: 'giantbomb' as const,
    };

    const mockContentFilter = {
      type: 'timestamp' as const,
      sort: {
        key: 'dateTimestamp',
        order: 'descending' as const,
      },
    };

    it('should call goto with generated URL', () => {
      handleContentNavigation({
        video: mockVideo,
        contentFilter: mockContentFilter,
      });

      expect(mockGoto).toHaveBeenCalledTimes(1);
      const [url, options] = mockGoto.mock.calls[0];
      expect(url).toContain('/video/video-456');
      expect(options).toEqual({
        invalidate: ['supabase:db:videos'],
      });
    });

    it('should handle navigation with playlist', () => {
      const mockPlaylist = { short_id: 'pl123' };

      handleContentNavigation({
        video: mockVideo,
        contentFilter: mockContentFilter,
        playlist: mockPlaylist as any,
      });

      expect(mockGoto).toHaveBeenCalledTimes(1);
      const [url] = mockGoto.mock.calls[0];
      expect(typeof url).toBe('string');
    });

    it('should use current window location for URL generation', () => {
      window.location.href = 'https://example.com/custom-page?param=value';

      handleContentNavigation({
        video: mockVideo,
        contentFilter: mockContentFilter,
      });

      expect(mockGoto).toHaveBeenCalledTimes(1);
      // URL should be generated using the current location context
    });
  });

  describe('getContentView', () => {
    it('should return TABLE for small screens', () => {
      const mediaQueryState = { isSm: false };
      const userProfile = { content_display: 'TILES' };

      const result = getContentView(mediaQueryState as any, userProfile as any);

      expect(result).toBe('TABLE');
    });

    it('should return TABLE when user prefers table display', () => {
      const mediaQueryState = { isSm: true }; // Large screen
      const userProfile = { content_display: 'TABLE' };

      const result = getContentView(mediaQueryState as any, userProfile as any);

      expect(result).toBe('TABLE');
    });

    it('should return TILES for large screens with tiles preference', () => {
      const mediaQueryState = { isSm: true };
      const userProfile = { content_display: 'TILES' };

      const result = getContentView(mediaQueryState as any, userProfile as any);

      expect(result).toBe('TILES');
    });

    it('should return TILES for large screens with no user profile', () => {
      const mediaQueryState = { isSm: true };
      const userProfile = null;

      const result = getContentView(mediaQueryState as any, userProfile);

      expect(result).toBe('TILES');
    });

    it('should handle missing media query state', () => {
      const userProfile = { content_display: 'TILES' };

      const result = getContentView(undefined, userProfile as any);

      expect(result).toBe('TABLE'); // Defaults to table when no media query
    });

    it('should handle missing user profile', () => {
      const mediaQueryState = { isSm: true };

      const result = getContentView(mediaQueryState as any, null);

      expect(result).toBe('TILES');
    });

    it('should handle undefined user profile content display', () => {
      const mediaQueryState = { isSm: true };
      const userProfile = { content_display: undefined };

      const result = getContentView(mediaQueryState as any, userProfile as any);

      expect(result).toBe('TILES');
    });

    it('should prioritize user preference over screen size', () => {
      const mediaQueryState = { isSm: true }; // Large screen
      const userProfile = { content_display: 'TABLE' }; // User prefers table

      const result = getContentView(mediaQueryState as any, userProfile as any);

      expect(result).toBe('TABLE'); // User preference wins
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle URL generation with malformed base URL', () => {
      const mockVideo = { id: 'video-123', source: 'giantbomb' as const };
      const mockContentFilter = {
        type: 'timestamp' as const,
        sort: { key: 'dateTimestamp', order: 'descending' as const },
      };

      // Test with various base URL formats
      const testUrls = [
        'invalid-url',
        'https://',
        'ftp://example.com',
        '',
      ];

      testUrls.forEach((baseUrl) => {
        expect(() => {
          generateContentNavigationUrl({
            video: mockVideo as any,
            contentFilter: mockContentFilter,
            baseUrl,
          });
        }).not.toThrow();
      });
    });

    it('should handle navigation with complex URL parameters', () => {
      window.location.href = 'https://example.com/path?q=search%20term&filter=value%20with%20spaces&empty=&special=a%26b';

      const mockVideo = { id: 'video-123', source: 'giantbomb' as const };
      const mockContentFilter = {
        type: 'timestamp' as const,
        sort: { key: 'dateTimestamp', order: 'descending' as const },
      };

      const url = generateContentNavigationUrl({
        video: mockVideo as any,
        contentFilter: mockContentFilter,
      });

      expect(url).toContain('q=search%20term');
      expect(url).toContain('filter=value%20with%20spaces');
      expect(url).toContain('special=a%26b');
    });

    it('should handle content navigation with null values', () => {
      const mockVideo = { id: 'video-123', source: 'giantbomb' as const };
      const mockContentFilter = {
        type: 'timestamp' as const,
        sort: { key: 'dateTimestamp', order: 'descending' as const },
      };

      // Should not throw with null playlist
      expect(() => {
        handleContentNavigation({
          video: mockVideo as any,
          contentFilter: mockContentFilter,
          playlist: null as any,
        });
      }).not.toThrow();

      expect(mockGoto).toHaveBeenCalled();
    });

    it('should handle getContentView with various invalid inputs', () => {
      // Test with invalid media query states
      expect(getContentView({} as any, null)).toBe('TABLE');
      expect(getContentView({ isSm: null } as any, null)).toBe('TABLE');
      expect(getContentView({ isSm: undefined } as any, null)).toBe('TABLE');

      // Test with invalid user profiles
      expect(getContentView({ isSm: true } as any, {} as any)).toBe('TILES');
      expect(getContentView({ isSm: true } as any, { content_display: null } as any)).toBe('TILES');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete navigation flow with all features', () => {
      // Set up complex scenario
      window.location.href = 'https://example.com/search?q=test&filter=active&sort=date';
      
      const mockVideo = {
        id: 'video-complex',
        source: 'giantbomb' as const,
        playlist_short_id: 'pl-complex',
        playlist_sorted_by: 'title',
        playlist_sort_order: 'ascending',
      };
      
      const mockPlaylist = {
        short_id: 'pl-user',
        sorted_by: 'datePublished',
        sort_order: 'descending',
      };
      
      const mockContentFilter = {
        type: 'playlist' as const,
        sort: { key: 'playlistOrder', order: 'ascending' as const },
      };

      // Configure mocks for user playlist scenario
      mockIsPlaylistVideosFilter.mockReturnValue(true);
      mockIsUserPlaylist.mockReturnValue(true);
      mockIsSortKey.mockReturnValue(true);
      mockIsSortOrder.mockReturnValue(true);
      mockGetSortKeysForView.mockReturnValue(['title', 'datePublished', 'playlistOrder']);

      const url = generateContentNavigationUrl({
        video: mockVideo as any,
        contentFilter: mockContentFilter,
        playlist: mockPlaylist as any,
      });

      // Should use playlist filter settings
      expect(url).toContain('/playlist/pl-user/video/video-complex');
      expect(url).toContain('playlistOrder=ascending');
      
      // Should preserve original search params except removed sort keys
      expect(url).toContain('q=test');
      expect(url).toContain('filter=active');
      expect(url).not.toContain('sort=date'); // Should be removed if it's a sort key
    });

    it('should handle navigation preference priority correctly', () => {
      // Test priority: playlist filter > user playlist > video timestamp > default
      
      const baseVideo = {
        id: 'video-priority',
        source: 'giantbomb' as const,
        playlist_short_id: 'pl-timestamp',
        playlist_sorted_by: 'title',
        playlist_sort_order: 'descending',
      };

      const userPlaylist = {
        short_id: 'pl-user',
        sorted_by: 'datePublished', 
        sort_order: 'ascending',
      };

      const playlistFilter = {
        type: 'playlist' as const,
        sort: { key: 'playlistOrder', order: 'descending' as const },
      };

      // Test 1: Playlist filter has highest priority
      mockIsPlaylistVideosFilter.mockReturnValue(true);
      mockIsUserPlaylist.mockReturnValue(true);
      mockIsVideoWithPlaylistTimestamp.mockReturnValue(true);
      mockIsSortKey.mockReturnValue(true);
      mockIsSortOrder.mockReturnValue(true);

      let url = generateContentNavigationUrl({
        video: baseVideo as any,
        contentFilter: playlistFilter,
        playlist: userPlaylist as any,
      });

      expect(url).toContain('/playlist/pl-user/video/video-priority');
      expect(url).toContain('playlistOrder=descending'); // Playlist filter wins

      // Test 2: User playlist has second priority
      mockIsPlaylistVideosFilter.mockReturnValue(false);
      
      url = generateContentNavigationUrl({
        video: baseVideo as any,
        contentFilter: { type: 'timestamp' as const, sort: { key: 'dateTimestamp', order: 'ascending' as const } },
        playlist: userPlaylist as any,
      });

      expect(url).toContain('/playlist/pl-user/video/video-priority');
      expect(url).toContain('datePublished=ascending'); // User playlist wins

      // Test 3: Video timestamp has third priority
      mockIsUserPlaylist.mockReturnValue(false);
      
      url = generateContentNavigationUrl({
        video: baseVideo as any,
        contentFilter: { type: 'timestamp' as const, sort: { key: 'dateTimestamp', order: 'ascending' as const } },
      });

      expect(url).toContain('/playlist/pl-timestamp/video/video-priority');
      expect(url).toContain('title=descending'); // Video timestamp wins

      // Test 4: Default video URL when no playlist context
      mockIsVideoWithPlaylistTimestamp.mockReturnValue(false);
      
      url = generateContentNavigationUrl({
        video: { id: 'video-priority', source: 'giantbomb' as const } as any,
        contentFilter: { type: 'timestamp' as const, sort: { key: 'dateTimestamp', order: 'ascending' as const } },
      });

      expect(url).toContain('/video/video-priority');
      expect(url).not.toContain('/playlist/');
    });
  });
});