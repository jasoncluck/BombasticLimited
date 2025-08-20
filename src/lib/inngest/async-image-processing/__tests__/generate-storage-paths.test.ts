import { describe, it, expect } from 'vitest';
import { generateStoragePaths } from '../../async-image-processing';

describe('generateStoragePaths', () => {
  describe('video paths', () => {
    it('should generate consistent thumbnail paths without timestamps', () => {
      const entityId = 'test-video-id';
      const imageType = 'thumbnail';

      // Call multiple times to ensure consistent paths
      const result1 = generateStoragePaths(
        'video',
        entityId,
        imageType,
        'job1',
        'worker1'
      );
      const result2 = generateStoragePaths(
        'video',
        entityId,
        imageType,
        'job2',
        'worker2'
      );

      // Paths should be identical regardless of job/worker/time
      expect(result1.webpPath).toBe(result2.webpPath);
      expect(result1.avifPath).toBe(result2.avifPath);

      // Verify exact path structure
      expect(result1.webpPath).toBe(
        'thumbnails/test-video-id/thumbnail-test-video-id.webp'
      );
      expect(result1.avifPath).toBe(
        'thumbnails/test-video-id/thumbnail-test-video-id.avif'
      );
    });

    it('should generate consistent maxres thumbnail paths without timestamps', () => {
      const entityId = 'test-video-id';
      const imageType = 'thumbnail_maxres';

      // Call multiple times to ensure consistent paths
      const result1 = generateStoragePaths(
        'video',
        entityId,
        imageType,
        'job1',
        'worker1'
      );
      const result2 = generateStoragePaths(
        'video',
        entityId,
        imageType,
        'job2',
        'worker2'
      );

      // Paths should be identical regardless of job/worker/time
      expect(result1.webpPath).toBe(result2.webpPath);
      expect(result1.avifPath).toBe(result2.avifPath);

      // Verify exact path structure
      expect(result1.webpPath).toBe(
        'thumbnails/test-video-id/thumbnail-maxres-test-video-id.webp'
      );
      expect(result1.avifPath).toBe(
        'thumbnails/test-video-id/thumbnail-maxres-test-video-id.avif'
      );
    });

    it('should generate consistent fallback video paths without timestamps', () => {
      const entityId = 'test-video-id';
      const imageType = 'unknown';

      // Call multiple times to ensure consistent paths
      const result1 = generateStoragePaths(
        'video',
        entityId,
        imageType,
        'job1',
        'worker1'
      );
      const result2 = generateStoragePaths(
        'video',
        entityId,
        imageType,
        'job2',
        'worker2'
      );

      // Paths should be identical regardless of job/worker/time
      expect(result1.webpPath).toBe(result2.webpPath);
      expect(result1.avifPath).toBe(result2.avifPath);

      // Verify exact path structure
      expect(result1.webpPath).toBe(
        'thumbnails/test-video-id/test-video-id-unknown.webp'
      );
      expect(result1.avifPath).toBe(
        'thumbnails/test-video-id/test-video-id-unknown.avif'
      );
    });
  });

  describe('playlist paths', () => {
    it('should generate unique playlist paths with timestamps', () => {
      const entityId = 'test-playlist-id';
      const imageType = 'playlist';

      // Add small delay to ensure different timestamps
      const result1 = generateStoragePaths(
        'playlist',
        entityId,
        imageType,
        'job1',
        'worker1'
      );

      // Small delay to ensure different timestamp
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      return delay(10).then(() => {
        const result2 = generateStoragePaths(
          'playlist',
          entityId,
          imageType,
          'job2',
          'worker2'
        );

        // Paths should be different due to timestamps
        expect(result1.webpPath).not.toBe(result2.webpPath);
        expect(result1.avifPath).not.toBe(result2.avifPath);

        // But should follow the same pattern
        expect(result1.webpPath).toMatch(
          /^playlists\/test-playlist-id\/playlist-test-playlist-id-\d+-\w+\.webp$/
        );
        expect(result1.avifPath).toMatch(
          /^playlists\/test-playlist-id\/playlist-test-playlist-id-\d+-\w+\.avif$/
        );
        expect(result2.webpPath).toMatch(
          /^playlists\/test-playlist-id\/playlist-test-playlist-id-\d+-\w+\.webp$/
        );
        expect(result2.avifPath).toMatch(
          /^playlists\/test-playlist-id\/playlist-test-playlist-id-\d+-\w+\.avif$/
        );
      });
    });

    it('should include job ID in playlist paths when provided', () => {
      const entityId = 'test-playlist-id';
      const imageType = 'playlist';
      const jobId = 'test-job-id-12345678';

      const result = generateStoragePaths(
        'playlist',
        entityId,
        imageType,
        jobId,
        'worker1'
      );

      // Should include first 8 chars of job ID
      expect(result.webpPath).toMatch(
        /playlist-test-playlist-id-\d+-test-job\.webp$/
      );
      expect(result.avifPath).toMatch(
        /playlist-test-playlist-id-\d+-test-job\.avif$/
      );
    });
  });

  describe('type consistency', () => {
    it('should return correct TypeScript types', () => {
      const result = generateStoragePaths('video', 'test-id', 'thumbnail');

      // Verify return type structure
      expect(typeof result.webpPath).toBe('string');
      expect(typeof result.avifPath).toBe('string');
      expect(result.webpPath.endsWith('.webp')).toBe(true);
      expect(result.avifPath.endsWith('.avif')).toBe(true);
    });
  });
});
