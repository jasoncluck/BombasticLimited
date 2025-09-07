import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSortKeysForView,
  getFilterKeysForView,
  isPlaylistVideosFilter,
  isTimestampFilter,
  isVideoFilter,
  isSortKey,
  isSortOrder,
  getSortDisplayName,
  SORT_OPTIONS_VIDEO,
  SORT_OPTIONS_PLAYLIST_VIDEOS,
  SORT_OPTIONS_TIMESTAMPS,
  videoSortKeys,
  playlistVideosSortKeys,
  timestampSortKeys,
  sortOrder,
  START_DATE_KEY,
  END_DATE_KEY,
  type CombinedContentFilter,
  type PlaylistVideosFilter,
  type TimestampFilter,
  type VideoFilter,
} from '../content-filter';

// Mock dependencies
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

vi.mock('../pagination/pagination', () => ({
  PAGINATION_QUERY_KEY: 'page',
}));

describe('Content Filter module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('should define video sort keys', () => {
      expect(videoSortKeys).toContain('searchRelevance');
      expect(videoSortKeys).toContain('datePublished');
      expect(videoSortKeys).toContain('title');
    });

    it('should define playlist videos sort keys', () => {
      expect(playlistVideosSortKeys).toContain('playlistOrder');
      expect(playlistVideosSortKeys).toContain('datePublished');
      expect(playlistVideosSortKeys).toContain('title');
    });

    it('should define timestamp sort keys', () => {
      expect(timestampSortKeys).toContain('dateTimestamp');
      expect(timestampSortKeys).toContain('datePublished');
      expect(timestampSortKeys).toContain('title');
    });

    it('should define sort orders', () => {
      expect(sortOrder).toContain('ascending');
      expect(sortOrder).toContain('descending');
    });

    it('should define date filter keys', () => {
      expect(START_DATE_KEY).toBe('startDate');
      expect(END_DATE_KEY).toBe('endDate');
    });

    it('should define sort option objects', () => {
      expect(SORT_OPTIONS_VIDEO).toHaveProperty('title');
      expect(SORT_OPTIONS_VIDEO).toHaveProperty('datePublished');
      expect(SORT_OPTIONS_VIDEO).toHaveProperty('searchRelevance');

      expect(SORT_OPTIONS_PLAYLIST_VIDEOS).toHaveProperty('title');
      expect(SORT_OPTIONS_PLAYLIST_VIDEOS).toHaveProperty('datePublished');
      expect(SORT_OPTIONS_PLAYLIST_VIDEOS).toHaveProperty('playlistOrder');

      expect(SORT_OPTIONS_TIMESTAMPS).toHaveProperty('title');
      expect(SORT_OPTIONS_TIMESTAMPS).toHaveProperty('datePublished');
      expect(SORT_OPTIONS_TIMESTAMPS).toHaveProperty('dateTimestamp');
    });
  });

  describe('getSortKeysForView', () => {
    it('should return appropriate keys for playlist view', () => {
      const keys = getSortKeysForView('playlist');
      
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should return appropriate keys for continue watching view', () => {
      const keys = getSortKeysForView('continueWatching');
      
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should return appropriate keys for search view', () => {
      const keys = getSortKeysForView('search');
      
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should return default keys for default view', () => {
      const keys = getSortKeysForView('default');
      
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('getFilterKeysForView', () => {
    it('should return filter keys for any view', () => {
      const views: Array<Parameters<typeof getFilterKeysForView>[0]> = [
        'playlist',
        'continueWatching', 
        'search',
        'default',
      ];
      
      views.forEach(view => {
        const keys = getFilterKeysForView(view);
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('filter type guards', () => {
    it('should correctly identify playlist videos filter', () => {
      const playlistFilter: PlaylistVideosFilter = {
        type: 'playlist',
        sort: { key: 'title', order: 'ascending' }
      };

      expect(isPlaylistVideosFilter(playlistFilter)).toBe(true);
      expect(isTimestampFilter(playlistFilter)).toBe(false);
      expect(isVideoFilter(playlistFilter)).toBe(false);
    });

    it('should correctly identify timestamp filter', () => {
      const timestampFilter: TimestampFilter = {
        type: 'timestamp',
        sort: { key: 'dateTimestamp', order: 'descending' }
      };

      expect(isTimestampFilter(timestampFilter)).toBe(true);
      expect(isPlaylistVideosFilter(timestampFilter)).toBe(false);
      expect(isVideoFilter(timestampFilter)).toBe(false);
    });

    it('should correctly identify video filter', () => {
      const videoFilter: VideoFilter = {
        type: 'video',
        sort: { key: 'searchRelevance', order: 'descending' }
      };

      expect(isVideoFilter(videoFilter)).toBe(true);
      expect(isPlaylistVideosFilter(videoFilter)).toBe(false);
      expect(isTimestampFilter(videoFilter)).toBe(false);
    });

    it('should handle malformed filter objects', () => {
      const malformedFilters = [
        null,
        undefined,
        {},
        { type: null },
        { sort: {} },
        'not-an-object',
      ];

      malformedFilters.forEach(filter => {
        expect(isPlaylistVideosFilter(filter as any)).toBe(false);
        expect(isTimestampFilter(filter as any)).toBe(false);
        expect(isVideoFilter(filter as any)).toBe(false);
      });
    });
  });

  describe('isSortOrder', () => {
    it('should validate ascending order', () => {
      expect(isSortOrder('ascending')).toBe(true);
    });

    it('should validate descending order', () => {
      expect(isSortOrder('descending')).toBe(true);
    });

    it('should reject invalid orders', () => {
      const invalidOrders = [
        'asc', 'desc', 'up', 'down', 'ASC', 'DESC',
        'Ascending', 'Descending', '', null, undefined,
        123, {}, [], true, false
      ];

      invalidOrders.forEach(order => {
        expect(isSortOrder(order as any)).toBe(false);
      });
    });

    it('should be case sensitive', () => {
      expect(isSortOrder('Ascending')).toBe(false);
      expect(isSortOrder('ASCENDING')).toBe(false);
      expect(isSortOrder('Descending')).toBe(false);
      expect(isSortOrder('DESCENDING')).toBe(false);
    });
  });

  describe('getSortDisplayName', () => {
    it('should return display names for video sort options', () => {
      const filter: VideoFilter = {
        type: 'video',
        sort: { key: 'title', order: 'ascending' }
      };

      const displayName = getSortDisplayName({ contentFilter: filter });
      expect(typeof displayName).toBe('string');
      expect(displayName.length).toBeGreaterThan(0);
    });

    it('should return display names for playlist sort options', () => {
      const filter: PlaylistVideosFilter = {
        type: 'playlist',
        sort: { key: 'playlistOrder', order: 'ascending' }
      };

      const displayName = getSortDisplayName({ contentFilter: filter });
      expect(typeof displayName).toBe('string');
      expect(displayName.length).toBeGreaterThan(0);
    });

    it('should return display names for timestamp sort options', () => {
      const filter: TimestampFilter = {
        type: 'timestamp',
        sort: { key: 'dateTimestamp', order: 'descending' }
      };

      const displayName = getSortDisplayName({ contentFilter: filter });
      expect(typeof displayName).toBe('string');
      expect(displayName.length).toBeGreaterThan(0);
    });

    it('should handle different sort keys', () => {
      const videoKeys: Array<VideoFilter['sort']['key']> = ['title', 'datePublished', 'searchRelevance'];
      
      videoKeys.forEach(key => {
        const filter: VideoFilter = {
          type: 'video',
          sort: { key, order: 'ascending' }
        };
        
        const displayName = getSortDisplayName({ contentFilter: filter });
        expect(typeof displayName).toBe('string');
        expect(displayName.length).toBeGreaterThan(0);
      });
    });
  });

  describe('isSortKey validation', () => {
    it('should validate keys against filter types', () => {
      const playlistFilter: PlaylistVideosFilter = {
        type: 'playlist',
        sort: { key: 'title', order: 'ascending' }
      };

      const timestampFilter: TimestampFilter = {
        type: 'timestamp',
        sort: { key: 'dateTimestamp', order: 'descending' }
      };

      const videoFilter: VideoFilter = {
        type: 'video',
        sort: { key: 'searchRelevance', order: 'ascending' }
      };

      // Test valid keys for each filter type
      expect(isSortKey('title', playlistFilter)).toBe(true);
      expect(isSortKey('playlistOrder', playlistFilter)).toBe(true);
      expect(isSortKey('datePublished', playlistFilter)).toBe(true);

      expect(isSortKey('dateTimestamp', timestampFilter)).toBe(true);
      expect(isSortKey('datePublished', timestampFilter)).toBe(true);
      expect(isSortKey('title', timestampFilter)).toBe(true);

      expect(isSortKey('searchRelevance', videoFilter)).toBe(true);
      expect(isSortKey('datePublished', videoFilter)).toBe(true);
      expect(isSortKey('title', videoFilter)).toBe(true);

      // Test invalid keys
      expect(isSortKey('dateTimestamp', playlistFilter)).toBe(false);
      expect(isSortKey('searchRelevance', timestampFilter)).toBe(false);
      expect(isSortKey('playlistOrder', videoFilter)).toBe(false);
    });

    it('should handle invalid inputs', () => {
      const filter: PlaylistVideosFilter = {
        type: 'playlist',
        sort: { key: 'title', order: 'ascending' }
      };

      const invalidKeys = [null, undefined, '', 123, {}, []];
      
      invalidKeys.forEach(key => {
        expect(isSortKey(key as any, filter)).toBe(false);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should work with all filter types consistently', () => {
      const filters: CombinedContentFilter[] = [
        { type: 'video', sort: { key: 'title', order: 'ascending' } },
        { type: 'playlist', sort: { key: 'playlistOrder', order: 'descending' } },
        { type: 'timestamp', sort: { key: 'dateTimestamp', order: 'ascending' } },
      ];

      filters.forEach(filter => {
        // Each filter should be recognized by exactly one type guard
        const guards = [
          isVideoFilter(filter),
          isPlaylistVideosFilter(filter),
          isTimestampFilter(filter),
        ];
        
        const trueCount = guards.filter(Boolean).length;
        expect(trueCount).toBe(1);

        // Should be able to get display name
        const displayName = getSortDisplayName({ contentFilter: filter });
        expect(typeof displayName).toBe('string');
        expect(displayName.length).toBeGreaterThan(0);

        // Sort order should be valid
        expect(isSortOrder(filter.sort.order)).toBe(true);
      });
    });

    it('should handle sort options consistently across filter types', () => {
      // Test that common sort keys work across appropriate filter types
      const commonKeys = ['title', 'datePublished'];
      
      commonKeys.forEach(key => {
        const playlistFilter: PlaylistVideosFilter = {
          type: 'playlist',
          sort: { key: key as any, order: 'ascending' }
        };
        
        const timestampFilter: TimestampFilter = {
          type: 'timestamp',
          sort: { key: key as any, order: 'descending' }
        };
        
        const videoFilter: VideoFilter = {
          type: 'video',
          sort: { key: key as any, order: 'ascending' }
        };

        expect(isSortKey(key, playlistFilter)).toBe(true);
        expect(isSortKey(key, timestampFilter)).toBe(true);
        expect(isSortKey(key, videoFilter)).toBe(true);

        // Should get valid display names
        expect(getSortDisplayName({ contentFilter: playlistFilter })).toBeTruthy();
        expect(getSortDisplayName({ contentFilter: timestampFilter })).toBeTruthy();
        expect(getSortDisplayName({ contentFilter: videoFilter })).toBeTruthy();
      });
    });
  });
});