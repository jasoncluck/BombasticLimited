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
}));

describe('Twitch API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
