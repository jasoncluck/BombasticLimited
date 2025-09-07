import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadSidebarData,
  refreshSidebarData,
  type SidebarData,
} from '../sidebar-service';

// Mock global fetch
const mockFetch = vi.fn();
Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
});

describe('sidebar service module', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Reset console methods to avoid test pollution
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockSidebarData = (): SidebarData => ({
    playlists: [
      {
        id: 1,
        name: 'My Playlist',
        short_id: 'pl123',
        created_by: 'user123',
        created_at: '2023-01-01T00:00:00Z',
        type: 'Public' as const,
        description: 'Test playlist',
        thumbnail_url: 'https://example.com/thumb.jpg',
        image_url: null,
        image_properties: null,
        youtube_id: null,
        deleted_at: null,
        image_processing_status: 'completed' as const,
        image_processing_updated_at: null,
      },
    ],
    userProfile: {
      id: 'user123',
      username: 'testuser',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      content_display: 'TILES' as const,
    },
    userPlaylistsCount: 5,
  });

  describe('loadSidebarData', () => {
    it('should load sidebar data successfully', async () => {
      const mockData = createMockSidebarData();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const result = await loadSidebarData();

      expect(mockFetch).toHaveBeenCalledWith('/api/sidebar');
      expect(result).toEqual(mockData);
    });

    it('should return null when response is not ok', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const result = await loadSidebarData();

      expect(mockFetch).toHaveBeenCalledWith('/api/sidebar');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load sidebar data:',
        'Internal Server Error'
      );
    });

    it('should return null when fetch throws an error', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const fetchError = new Error('Network error');
      mockFetch.mockRejectedValue(fetchError);

      const result = await loadSidebarData();

      expect(mockFetch).toHaveBeenCalledWith('/api/sidebar');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load sidebar:', fetchError);
    });

    it('should handle empty response data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      });

      const result = await loadSidebarData();

      expect(result).toBeNull();
    });

    it('should handle malformed JSON response', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const jsonError = new Error('Invalid JSON');
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(jsonError),
      });

      const result = await loadSidebarData();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load sidebar:', jsonError);
    });

    it('should handle different HTTP error status codes', async () => {
      const testCases = [
        { status: 400, statusText: 'Bad Request' },
        { status: 401, statusText: 'Unauthorized' },
        { status: 403, statusText: 'Forbidden' },
        { status: 404, statusText: 'Not Found' },
        { status: 500, statusText: 'Internal Server Error' },
      ];

      for (const testCase of testCases) {
        const consoleSpy = vi.spyOn(console, 'error');
        mockFetch.mockResolvedValue({
          ok: false,
          status: testCase.status,
          statusText: testCase.statusText,
        });

        const result = await loadSidebarData();

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to load sidebar data:',
          testCase.statusText
        );

        consoleSpy.mockRestore();
      }
    });

    it('should handle complex sidebar data structures', async () => {
      const complexData: SidebarData = {
        playlists: [
          {
            id: 1,
            name: 'Playlist 1',
            short_id: 'pl001',
            created_by: 'user123',
            created_at: '2023-01-01T00:00:00Z',
            type: 'Public' as const,
            description: 'First playlist',
            thumbnail_url: 'https://example.com/thumb1.jpg',
            image_url: 'https://example.com/image1.jpg',
            image_properties: { x: 0, y: 0, width: 100, height: 100 },
            youtube_id: 'PLtest123',
            deleted_at: null,
            image_processing_status: 'completed',
            image_processing_updated_at: '2023-01-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'Playlist 2',
            short_id: 'pl002',
            created_by: 'user456',
            created_at: '2023-01-02T00:00:00Z',
            type: 'Private' as const,
            description: null,
            thumbnail_url: null,
            image_url: null,
            image_properties: null,
            youtube_id: null,
            deleted_at: null,
            image_processing_status: null,
            image_processing_updated_at: null,
          },
        ],
        userProfile: {
          id: 'user123',
          username: 'complexuser',
          email: 'complex@example.com',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-15T00:00:00Z',
          content_display: 'TABLE' as const,
        },
        userPlaylistsCount: 25,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(complexData),
      });

      const result = await loadSidebarData();

      expect(result).toEqual(complexData);
      expect(result?.playlists).toHaveLength(2);
      expect(result?.userPlaylistsCount).toBe(25);
    });

    it('should handle timeout scenarios', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockFetch.mockRejectedValue(timeoutError);

      const result = await loadSidebarData();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load sidebar:', timeoutError);
    });

    it('should handle network connection errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const networkError = new Error('Failed to fetch');
      networkError.name = 'NetworkError';
      mockFetch.mockRejectedValue(networkError);

      const result = await loadSidebarData();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load sidebar:', networkError);
    });
  });

  describe('refreshSidebarData', () => {
    it('should refresh sidebar data by calling loadSidebarData', async () => {
      const mockData = createMockSidebarData();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const result = await refreshSidebarData();

      expect(mockFetch).toHaveBeenCalledWith('/api/sidebar');
      expect(result).toEqual(mockData);
    });

    it('should return null when refresh fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable',
      });

      const result = await refreshSidebarData();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load sidebar data:',
        'Service Unavailable'
      );
    });

    it('should handle multiple consecutive refresh calls', async () => {
      const mockData1 = createMockSidebarData();
      const mockData2 = {
        ...createMockSidebarData(),
        userPlaylistsCount: 10,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData2),
        });

      const result1 = await refreshSidebarData();
      const result2 = await refreshSidebarData();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result1).toEqual(mockData1);
      expect(result2).toEqual(mockData2);
    });

    it('should handle mixed success and failure scenarios', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const mockData = createMockSidebarData();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData),
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData),
        });

      const result1 = await refreshSidebarData();
      const result2 = await refreshSidebarData();
      const result3 = await refreshSidebarData();

      expect(result1).toEqual(mockData);
      expect(result2).toBeNull();
      expect(result3).toEqual(mockData);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load sidebar data:',
        'Server Error'
      );
    });
  });

  describe('error handling edge cases', () => {
    it('should handle AbortError gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await loadSidebarData();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load sidebar:', abortError);
    });

    it('should handle response with empty headers', async () => {
      const mockData = createMockSidebarData();
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue(mockData),
      });

      const result = await loadSidebarData();

      expect(result).toEqual(mockData);
    });

    it('should handle very large responses', async () => {
      const largeData: SidebarData = {
        playlists: Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          name: `Playlist ${i + 1}`,
          short_id: `pl${i.toString().padStart(3, '0')}`,
          created_by: 'user123',
          created_at: '2023-01-01T00:00:00Z',
          type: 'Public' as const,
          description: `Description for playlist ${i + 1}`,
          thumbnail_url: `https://example.com/thumb${i + 1}.jpg`,
          image_url: null,
          image_properties: null,
          youtube_id: null,
          deleted_at: null,
          image_processing_status: null,
          image_processing_updated_at: null,
        })),
        userProfile: {
          id: 'user123',
          username: 'userwithlargecollection',
          email: 'large@example.com',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          content_display: 'TILES' as const,
        },
        userPlaylistsCount: 100,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(largeData),
      });

      const result = await loadSidebarData();

      expect(result).toEqual(largeData);
      expect(result?.playlists).toHaveLength(100);
    });
  });

  describe('type safety and data validation', () => {
    it('should handle response data that matches SidebarData interface', async () => {
      const validData: SidebarData = createMockSidebarData();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(validData),
      });

      const result = await loadSidebarData();

      expect(result).toEqual(validData);
      // Type checks
      if (result) {
        expect(Array.isArray(result.playlists)).toBe(true);
        expect(typeof result.userProfile).toBe('object');
        expect(typeof result.userPlaylistsCount).toBe('number');
      }
    });

    it('should handle responses with additional properties', async () => {
      const dataWithExtra = {
        ...createMockSidebarData(),
        extraProperty: 'should be ignored',
        nestedExtra: { deep: 'property' },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(dataWithExtra),
      });

      const result = await loadSidebarData();

      expect(result).toEqual(dataWithExtra);
    });

    it('should handle responses with missing optional properties', async () => {
      const minimalData = {
        playlists: [],
        userProfile: {
          id: 'user123',
          username: 'minimaluser',
          email: 'minimal@example.com',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          content_display: 'TILES' as const,
        },
        userPlaylistsCount: 0,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(minimalData),
      });

      const result = await loadSidebarData();

      expect(result).toEqual(minimalData);
      expect(result?.playlists).toHaveLength(0);
      expect(result?.userPlaylistsCount).toBe(0);
    });
  });
});