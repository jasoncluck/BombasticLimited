import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('$lib/server/db', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import {
  getPremiumFeedUrl,
  upsertPremiumFeed,
  deletePremiumFeed,
} from '../premium-feeds';

describe('podcasts premium-feeds module', () => {
  const originalKey = process.env.PODCAST_FEED_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PODCAST_FEED_ENCRYPTION_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.PODCAST_FEED_ENCRYPTION_KEY = originalKey;
  });

  describe('getPremiumFeedUrl', () => {
    it('decrypts and returns the caller feed url', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ feed_url: 'https://example.com/feed.rss' }],
      });

      const { feedUrl, error } = await getPremiumFeedUrl({
        userId: 'user-1',
        source: 'giantbomb',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pgp_sym_decrypt'),
        ['test-key', 'user-1', 'giantbomb']
      );
      expect(feedUrl).toBe('https://example.com/feed.rss');
      expect(error).toBeUndefined();
    });

    it('returns null when no premium feed is saved', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const { feedUrl } = await getPremiumFeedUrl({
        userId: 'user-1',
        source: 'giantbomb',
      });

      expect(feedUrl).toBeNull();
    });

    it('returns an error without throwing when the encryption key is missing', async () => {
      delete process.env.PODCAST_FEED_ENCRYPTION_KEY;

      const { feedUrl, error } = await getPremiumFeedUrl({
        userId: 'user-1',
        source: 'giantbomb',
      });

      expect(feedUrl).toBeNull();
      expect(error).toBeDefined();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('upsertPremiumFeed', () => {
    it('encrypts the feed url and upserts on (source, user_id)', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const { error } = await upsertPremiumFeed({
        userId: 'user-1',
        source: 'giantbomb',
        feedUrl: 'https://example.com/feed.rss',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pgp_sym_encrypt'),
        ['test-key', 'user-1', 'giantbomb', 'https://example.com/feed.rss']
      );
      expect(error).toBeUndefined();
    });
  });

  describe('deletePremiumFeed', () => {
    it('deletes the premium feed row for that source', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const { error } = await deletePremiumFeed({
        userId: 'user-1',
        source: 'giantbomb',
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        'user-1',
        'giantbomb',
      ]);
      expect(error).toBeUndefined();
    });
  });
});
