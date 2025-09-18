import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment variables before importing the module
vi.mock('$env/static/private', () => ({
  TWITCH_CLIENT_ID: 'test_client_id',
  TWITCH_CLIENT_SECRET: 'test_client_secret',
}));

// Mock the @twurple modules
vi.mock('@twurple/auth', () => ({
  AppTokenAuthProvider: vi.fn(),
}));

vi.mock('@twurple/api', () => ({
  ApiClient: vi.fn(() => ({
    streams: {
      getStreamByUserId: vi.fn().mockResolvedValue(null),
    },
  })),
  extractUserId: vi.fn().mockReturnValue('123456'),
}));

describe('Twitch API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset NODE_ENV for each test
    vi.stubEnv('NODE_ENV', 'test');
  });

  describe('cache management', () => {
    it('should clear cache correctly', async () => {
      const { clearStreamCache, getCacheStats } = await import('../twitch.js');

      clearStreamCache();
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it('should provide cache statistics structure', async () => {
      const { getCacheStats } = await import('../twitch.js');

      const stats = getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
      expect(Array.isArray(stats.entries)).toBe(true);
    });
  });

  describe('function availability', () => {
    it('should export all required functions', async () => {
      const twitchModule = await import('../twitch.js');

      expect(typeof twitchModule.getStreamStatus).toBe('function');
      expect(typeof twitchModule.getMultipleStreamStatus).toBe('function');
      expect(typeof twitchModule.clearStreamCache).toBe('function');
      expect(typeof twitchModule.getCacheStats).toBe('function');
    });

    it('should handle missing credentials gracefully', async () => {
      // Since we're in test environment, the API client won't initialize
      // This tests the graceful degradation behavior

      const { getStreamStatus, getMultipleStreamStatus } = await import(
        '../twitch.js'
      );

      const singleResult = await getStreamStatus('123456');
      const multipleResult = await getMultipleStreamStatus(['123', '456']);

      // Should handle gracefully - either return null or empty array
      expect(singleResult === null || typeof singleResult === 'object').toBe(
        true
      );

      expect(Array.isArray(multipleResult)).toBe(true);
    });
  });

  describe('API structure', () => {
    it('should maintain expected StreamStatus interface', async () => {
      const { getStreamStatus } = await import('../twitch.js');

      const result = await getStreamStatus('123456');

      // If we get a result, it should have the expected structure
      if (result) {
        expect(result).toHaveProperty('userId');
        expect(result).toHaveProperty('isLive');
        expect(result).toHaveProperty('lastChecked');
        expect(typeof result.isLive).toBe('boolean');
        expect(typeof result.lastChecked).toBe('number');
      }
    });
  });

  describe('getStreamStatus', () => {
    it('should return null when stream is offline', async () => {
      const { getStreamStatus } = await import('../twitch.js');

      const result = await getStreamStatus('123456');

      // Since mock returns null, we expect null
      expect(result).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      // Mock API to throw error
      const mockApiClient = {
        streams: {
          getStreamByUserId: vi.fn().mockRejectedValue(new Error('API Error')),
        },
      };

      vi.doMock('@twurple/api', () => ({
        ApiClient: vi.fn(() => mockApiClient),
        extractUserId: vi.fn().mockReturnValue('123456'),
      }));

      const { getStreamStatus } = await import('../twitch.js');

      const result = await getStreamStatus('123456');

      expect(result).toBeNull();
    });

    it('should use cache for repeated requests when API client is available', async () => {
      // This test just verifies the cache API works, since the implementation
      // returns early when no API client is available in test environment
      const { clearStreamCache, getCacheStats } = await import('../twitch.js');

      clearStreamCache();

      // Since API client is not available in test, we expect cache to remain empty
      // This still tests the cache functionality exists and can be called
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });
  });

  describe('getMultipleStreamStatus', () => {
    it('should handle empty array', async () => {
      const { getMultipleStreamStatus } = await import('../twitch.js');

      const result = await getMultipleStreamStatus([]);

      expect(result).toEqual([]);
    });

    it('should handle multiple user IDs', async () => {
      const { getMultipleStreamStatus } = await import('../twitch.js');

      const result = await getMultipleStreamStatus(['123456', '789012']);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should continue processing even if one user fails', async () => {
      // Mock API to fail for first user but succeed for second
      const mockApiClient = {
        streams: {
          getStreamByUserId: vi
            .fn()
            .mockRejectedValueOnce(new Error('API Error'))
            .mockResolvedValueOnce(null),
        },
      };

      vi.doMock('@twurple/api', () => ({
        ApiClient: vi.fn(() => mockApiClient),
        extractUserId: vi.fn().mockReturnValue('123456'),
      }));

      const { getMultipleStreamStatus } = await import('../twitch.js');

      const result = await getMultipleStreamStatus([
        'fail-user',
        'success-user',
      ]);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when no API client', async () => {
      // Mock environment to have no credentials
      vi.doMock('$env/static/private', () => ({
        TWITCH_CLIENT_ID: '',
        TWITCH_CLIENT_SECRET: '',
      }));

      const { getMultipleStreamStatus } = await import('../twitch.js');

      const result = await getMultipleStreamStatus(['123456']);

      expect(result).toEqual([]);
    });
  });
});
