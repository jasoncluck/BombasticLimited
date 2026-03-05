import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PAGINATION_QUERY_KEY,
  updatePaginationQueryParams,
  getPaginationQueryParams,
  getNumberOfPages,
  generatePaginationUrl,
  preloadPaginationPage,
} from '../pagination';

// Mock SvelteKit navigation
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  preloadData: vi.fn(),
}));

// Import the mocked functions for use in tests
import { goto, preloadData } from '$app/navigation';

describe('pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('should export correct pagination query key', () => {
      expect(PAGINATION_QUERY_KEY).toBe('page');
    });
  });

  describe('getPaginationQueryParams', () => {
    it('should return page number from search params', () => {
      const searchParams = new URLSearchParams('page=5');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(5);
    });

    it('should return 1 when no page param exists', () => {
      const searchParams = new URLSearchParams('');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(1);
    });

    it('should return 1 when page param is invalid', () => {
      const searchParams = new URLSearchParams('page=invalid');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(1);
    });

    it('should return 1 when page param is empty', () => {
      const searchParams = new URLSearchParams('page=');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(1);
    });

    it('should handle negative page numbers', () => {
      const searchParams = new URLSearchParams('page=-5');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(-5);
    });

    it('should handle zero page number', () => {
      const searchParams = new URLSearchParams('page=0');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(0);
    });

    it('should handle decimal page numbers by parsing as integer', () => {
      const searchParams = new URLSearchParams('page=3.14');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(3);
    });

    it('should handle multiple page parameters by using the first one', () => {
      const searchParams = new URLSearchParams('page=2&page=3');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(2);
    });

    it('should handle other query parameters', () => {
      const searchParams = new URLSearchParams('sort=name&page=7&limit=50');
      const result = getPaginationQueryParams({ searchParams });
      expect(result).toBe(7);
    });
  });

  describe('getNumberOfPages', () => {
    it('should calculate correct number of pages', () => {
      expect(getNumberOfPages({ count: 100, perPage: 10 })).toBe(10);
      expect(getNumberOfPages({ count: 95, perPage: 10 })).toBe(10);
      expect(getNumberOfPages({ count: 101, perPage: 10 })).toBe(11);
    });

    it('should handle zero count', () => {
      expect(getNumberOfPages({ count: 0, perPage: 10 })).toBe(0);
    });

    it('should handle undefined count (defaults to 0)', () => {
      expect(getNumberOfPages({ perPage: 10 })).toBe(0);
    });

    it('should handle count less than perPage', () => {
      expect(getNumberOfPages({ count: 5, perPage: 10 })).toBe(1);
    });

    it('should handle count equal to perPage', () => {
      expect(getNumberOfPages({ count: 10, perPage: 10 })).toBe(1);
    });

    it('should handle different perPage values', () => {
      expect(getNumberOfPages({ count: 100, perPage: 25 })).toBe(4);
      expect(getNumberOfPages({ count: 100, perPage: 30 })).toBe(4);
      expect(getNumberOfPages({ count: 100, perPage: 33 })).toBe(4);
    });

    it('should handle large numbers', () => {
      expect(getNumberOfPages({ count: 10000, perPage: 100 })).toBe(100);
      expect(getNumberOfPages({ count: 9999, perPage: 100 })).toBe(100);
      expect(getNumberOfPages({ count: 10001, perPage: 100 })).toBe(101);
    });

    it('should handle edge case with perPage of 1', () => {
      expect(getNumberOfPages({ count: 5, perPage: 1 })).toBe(5);
    });
  });

  describe('generatePaginationUrl', () => {
    it('should generate URL with page parameter', () => {
      const url = new URL('https://example.com/videos');
      const result = generatePaginationUrl({ url, pageNum: 3 });
      expect(result).toBe('https://example.com/videos?page=3');
    });

    it('should replace existing page parameter', () => {
      const url = new URL('https://example.com/videos?page=1');
      const result = generatePaginationUrl({ url, pageNum: 5 });
      expect(result).toBe('https://example.com/videos?page=5');
    });

    it('should preserve other query parameters', () => {
      const url = new URL('https://example.com/videos?sort=name&limit=25');
      const result = generatePaginationUrl({ url, pageNum: 2 });
      expect(result).toBe(
        'https://example.com/videos?sort=name&limit=25&page=2'
      );
    });

    it('should handle complex URLs', () => {
      const url = new URL(
        'https://example.com/path/to/videos?sort=date&filter=new'
      );
      const result = generatePaginationUrl({ url, pageNum: 10 });
      expect(result).toBe(
        'https://example.com/path/to/videos?sort=date&filter=new&page=10'
      );
    });

    it('should handle page number 0', () => {
      const url = new URL('https://example.com/videos');
      const result = generatePaginationUrl({ url, pageNum: 0 });
      expect(result).toBe('https://example.com/videos?page=0');
    });

    it('should handle negative page numbers', () => {
      const url = new URL('https://example.com/videos');
      const result = generatePaginationUrl({ url, pageNum: -1 });
      expect(result).toBe('https://example.com/videos?page=-1');
    });

    it('should preserve URL hash', () => {
      const url = new URL('https://example.com/videos#section');
      const result = generatePaginationUrl({ url, pageNum: 4 });
      expect(result).toBe('https://example.com/videos?page=4#section');
    });

    it('should handle URLs with existing page and other parameters', () => {
      const url = new URL(
        'https://example.com/videos?page=1&sort=name&limit=50'
      );
      const result = generatePaginationUrl({ url, pageNum: 8 });
      expect(result).toBe(
        'https://example.com/videos?page=8&sort=name&limit=50'
      );
    });
  });

  describe('updatePaginationQueryParams', () => {
    it('should call goto with updated URL', () => {
      const url = new URL('https://example.com/videos');
      const pageNum = 3;
      const invalidate: string[] = ['app:videos'];

      updatePaginationQueryParams({ url, pageNum, invalidate });

      expect(goto).toHaveBeenCalledWith('https://example.com/videos?page=3', {
        invalidate: ['app:videos'],
      });
    });

    it('should preserve existing query parameters', () => {
      const url = new URL('https://example.com/videos?sort=name&limit=25');
      const pageNum = 2;
      const invalidate: string[] = [];

      updatePaginationQueryParams({ url, pageNum, invalidate });

      expect(goto).toHaveBeenCalledWith(
        'https://example.com/videos?sort=name&limit=25&page=2',
        {
          invalidate: [],
        }
      );
    });

    it('should replace existing page parameter', () => {
      const url = new URL('https://example.com/videos?page=1&sort=date');
      const pageNum = 5;
      const invalidate = ['app:videos', 'app:pagination'];

      updatePaginationQueryParams({ url, pageNum, invalidate });

      expect(goto).toHaveBeenCalledWith(
        'https://example.com/videos?page=5&sort=date',
        {
          invalidate: ['app:videos', 'app:pagination'],
        }
      );
    });

    it('should handle multiple invalidate values', () => {
      const url = new URL('https://example.com/videos');
      const pageNum = 1;
      const invalidate = ['videos', 'pagination', 'filters'];

      updatePaginationQueryParams({ url, pageNum, invalidate });

      expect(goto).toHaveBeenCalledWith('https://example.com/videos?page=1', {
        invalidate: ['videos', 'pagination', 'filters'],
      });
    });

    it('should handle page number 0', () => {
      const url = new URL('https://example.com/videos');
      const pageNum = 0;
      const invalidate: string[] = [];

      updatePaginationQueryParams({ url, pageNum, invalidate });

      expect(goto).toHaveBeenCalledWith('https://example.com/videos?page=0', {
        invalidate: [],
      });
    });
  });

  describe('preloadPaginationPage', () => {
    beforeEach(() => {
      // Mock console.debug to prevent test output
      vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('should preload data for pagination URL', async () => {
      vi.mocked(preloadData).mockResolvedValue(undefined as any);

      const url = new URL('https://example.com/videos');
      await preloadPaginationPage({ url, pageNum: 3 });

      expect(preloadData).toHaveBeenCalledWith(
        'https://example.com/videos?page=3'
      );
    });

    it('should handle preload errors silently', async () => {
      const preloadError = new Error('Preload failed');
      vi.mocked(preloadData).mockRejectedValue(preloadError);

      const url = new URL('https://example.com/videos');

      // Should not throw
      await expect(
        preloadPaginationPage({ url, pageNum: 2 })
      ).resolves.toBeUndefined();

      expect(console.debug).toHaveBeenCalledWith(
        'Pagination preload failed:',
        preloadError
      );
    });

    it('should preserve existing query parameters in preload URL', async () => {
      vi.mocked(preloadData).mockResolvedValue(undefined as any);

      const url = new URL('https://example.com/videos?sort=date&limit=50');
      await preloadPaginationPage({ url, pageNum: 5 });

      expect(preloadData).toHaveBeenCalledWith(
        'https://example.com/videos?sort=date&limit=50&page=5'
      );
    });

    it('should handle different page numbers', async () => {
      vi.mocked(preloadData).mockResolvedValue(undefined as any);

      const url = new URL('https://example.com/videos');

      await preloadPaginationPage({ url, pageNum: 1 });
      expect(preloadData).toHaveBeenCalledWith(
        'https://example.com/videos?page=1'
      );

      await preloadPaginationPage({ url, pageNum: 10 });
      expect(preloadData).toHaveBeenCalledWith(
        'https://example.com/videos?page=10'
      );

      await preloadPaginationPage({ url, pageNum: 0 });
      expect(preloadData).toHaveBeenCalledWith(
        'https://example.com/videos?page=0'
      );
    });

    it('should handle complex URLs', async () => {
      vi.mocked(preloadData).mockResolvedValue(undefined as any);

      const url = new URL(
        'https://example.com/path/to/content?filter=active&search=test'
      );
      await preloadPaginationPage({ url, pageNum: 7 });

      expect(preloadData).toHaveBeenCalledWith(
        'https://example.com/path/to/content?filter=active&search=test&page=7'
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete pagination workflow', () => {
      // Test the workflow: get current page -> calculate pages -> generate URLs

      // 1. Get current page from URL
      const searchParams = new URLSearchParams('page=2&sort=name');
      const currentPage = getPaginationQueryParams({ searchParams });
      expect(currentPage).toBe(2);

      // 2. Calculate total pages
      const totalItems = 250;
      const itemsPerPage = 25;
      const totalPages = getNumberOfPages({
        count: totalItems,
        perPage: itemsPerPage,
      });
      expect(totalPages).toBe(10);

      // 3. Generate URLs for navigation
      const baseUrl = new URL('https://example.com/videos?sort=name');
      const nextPageUrl = generatePaginationUrl({
        url: baseUrl,
        pageNum: currentPage + 1,
      });
      const prevPageUrl = generatePaginationUrl({
        url: baseUrl,
        pageNum: currentPage - 1,
      });

      expect(nextPageUrl).toBe('https://example.com/videos?sort=name&page=3');
      expect(prevPageUrl).toBe('https://example.com/videos?sort=name&page=1');
    });

    it('should handle edge cases in pagination workflow', () => {
      // Test edge cases: first page, last page, etc.

      const searchParams = new URLSearchParams('page=1');
      const currentPage = getPaginationQueryParams({ searchParams });
      expect(currentPage).toBe(1);

      // Small dataset
      const totalItems = 5;
      const itemsPerPage = 10;
      const totalPages = getNumberOfPages({
        count: totalItems,
        perPage: itemsPerPage,
      });
      expect(totalPages).toBe(1);

      // Generate URLs for edge cases
      const baseUrl = new URL('https://example.com/videos');
      const firstPageUrl = generatePaginationUrl({ url: baseUrl, pageNum: 1 });
      const lastPageUrl = generatePaginationUrl({
        url: baseUrl,
        pageNum: totalPages,
      });

      expect(firstPageUrl).toBe('https://example.com/videos?page=1');
      expect(lastPageUrl).toBe('https://example.com/videos?page=1');
    });

    it('should maintain URL consistency across operations', () => {
      const originalUrl = new URL(
        'https://example.com/videos?sort=date&filter=active'
      );

      // Extract page number (should default to 1)
      const currentPage = getPaginationQueryParams({
        searchParams: originalUrl.searchParams,
      });
      expect(currentPage).toBe(1);

      // Generate new URL with different page
      const newPageUrl = generatePaginationUrl({
        url: originalUrl,
        pageNum: 5,
      });
      expect(newPageUrl).toBe(
        'https://example.com/videos?sort=date&filter=active&page=5'
      );

      // Parse the new URL to verify page extraction
      const newUrl = new URL(newPageUrl);
      const extractedPage = getPaginationQueryParams({
        searchParams: newUrl.searchParams,
      });
      expect(extractedPage).toBe(5);
    });
  });
});
