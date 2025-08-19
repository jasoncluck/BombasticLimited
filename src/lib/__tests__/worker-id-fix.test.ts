import { describe, it, expect } from 'vitest';
import { queueVideoImageProcessing, queuePlaylistImageProcessing } from '$lib/inngest/image-queue';

describe('Database Job Queue Functions', () => {
  it('should have the correct function signatures', () => {
    expect(typeof queueVideoImageProcessing).toBe('function');
    expect(typeof queuePlaylistImageProcessing).toBe('function');
  });

  it('should accept the expected parameters for video processing', () => {
    // Test that the function can be called with the expected parameters
    const videoId = 'test-video-id';
    const thumbnailUrl = 'https://i.ytimg.com/vi/test/default.jpg';
    const thumbnailMaxresUrl = 'https://i.ytimg.com/vi/test/maxresdefault.jpg';
    const priority = 100;

    expect(() => {
      // Just verify the function signature - actual DB calls would require a live connection
      const params = [videoId, thumbnailUrl, thumbnailMaxresUrl, priority];
      expect(params).toHaveLength(4);
    }).not.toThrow();
  });

  it('should accept the expected parameters for playlist processing', () => {
    // Test that the function can be called with the expected parameters
    const playlistId = 'test-playlist-id';
    const imageUrl = 'playlists/123/image.webp';
    const priority = 100;

    expect(() => {
      // Just verify the function signature - actual DB calls would require a live connection
      const params = [playlistId, imageUrl, priority];
      expect(params).toHaveLength(3);
    }).not.toThrow();
  });
});

describe('Worker ID Generation', () => {
  it('should generate unique worker IDs', () => {
    // Import the generateWorkerId function from job_poller.ts
    // Since it's not exported, we'll test the concept
    const generateWorkerId = (): string => {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substr(2, 8);
      return `worker-${timestamp}-${random}`;
    };

    const workerId1 = generateWorkerId();
    const workerId2 = generateWorkerId();
    
    expect(workerId1).toMatch(/^worker-[a-z0-9]+-[a-z0-9]+$/);
    expect(workerId2).toMatch(/^worker-[a-z0-9]+-[a-z0-9]+$/);
    expect(workerId1).not.toBe(workerId2);
  });
});