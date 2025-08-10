import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCroppedPlaylistImageUrlServer,
  getVideoThumbnailWebpUrlServer,
  getVideoThumbnailWebpUrlsBatch,
} from '../image-processing';
import type { ImageProperties } from '$lib/components/playlist/playlist';

// Mock sharp
const mockSharp = vi.fn();
const mockExtract = vi.fn();
const mockWebp = vi.fn();
const mockToBuffer = vi.fn();
const mockMetadata = vi.fn();

vi.mock('sharp', () => ({
  default: (...args: any[]) => {
    mockSharp(...args);
    return {
      metadata: mockMetadata,
      extract: mockExtract.mockReturnThis(),
      webp: mockWebp.mockReturnThis(),
      toBuffer: mockToBuffer,
    };
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('getCroppedPlaylistImageUrlServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default metadata response
    mockMetadata.mockResolvedValue({
      width: 1280,
      height: 720,
    });
  });

  it('should process image and return WebP data URL', async () => {
    const imageProperties: ImageProperties = {
      x: 10,
      y: 20,
      width: 100,
      height: 150,
    };

    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    const result = await getCroppedPlaylistImageUrlServer({
      imageProperties,
      thumbnailMaxResUrl: 'https://example.com/image.jpg',
      thumbnailUrl: null,
    });

    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Playlist-Service/1.0',
      },
    });

    // Verify Sharp processing
    expect(mockSharp).toHaveBeenCalledWith(mockImageBuffer, {
      failOnError: false,
      density: 72,
      pages: 1, // Added for animated image handling
    });

    expect(mockExtract).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      width: 100,
      height: 150,
    });

    expect(mockWebp).toHaveBeenCalledWith({
      quality: 90,
      effort: 3, // Enhanced effort level
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      // Progressive is not available for WebP, handled by format itself
    });

    // Verify result format
    const expectedBase64 = mockProcessedBuffer.toString('base64');
    expect(result).toBe(`data:image/webp;base64,${expectedBase64}`);
  });

  it('should use default crop properties when not provided', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: 'https://example.com/image.jpg',
      thumbnailUrl: null,
    });

    // Should use PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
    expect(mockExtract).toHaveBeenCalledWith({
      left: 280,
      top: 0,
      width: 720,
      height: 720,
    });
  });

  it('should prefer thumbnailMaxResUrl over thumbnailUrl', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: 'https://example.com/maxres.jpg',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/maxres.jpg',
      expect.any(Object)
    );
  });

  it('should return null when no image URL is provided', async () => {
    const result = await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: null,
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return null on fetch error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
    });

    // Use a unique URL to avoid cache hits from other tests
    const uniqueUrl = `https://example.com/image-fetch-error-${Date.now()}.jpg`;
    
    const result = await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: uniqueUrl,
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
  });

  it('should return null on processing error', async () => {
    // Use a unique URL to avoid cache hits from other tests
    const uniqueUrl = `https://example.com/image-processing-error-${Date.now()}.jpg`;
    
    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
    });

    mockToBuffer.mockRejectedValue(new Error('Sharp processing failed'));

    const result = await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: uniqueUrl,
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
  });
});

describe('getVideoThumbnailWebpUrlServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default metadata response for video thumbnails too
    mockMetadata.mockResolvedValue({
      width: 1280,
      height: 720,
    });
  });

  it('should process video thumbnail and return WebP data URL without cropping', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-video-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    const result = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/video-thumb.jpg',
    });

    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/video-thumb.jpg',
      {
        signal: expect.any(AbortSignal),
        headers: {
          Accept: 'image/*',
          'User-Agent': 'Video-Service/1.0',
        },
      }
    );

    // Verify Sharp processing without extract (no cropping)
    expect(mockSharp).toHaveBeenCalledWith(mockImageBuffer, {
      failOnError: false,
      density: 72,
      pages: 1,
    });

    expect(mockExtract).not.toHaveBeenCalled(); // No cropping for video thumbnails

    expect(mockWebp).toHaveBeenCalledWith({
      quality: 90,
      effort: 3, // Enhanced effort level
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      // Progressive is not available for WebP, handled by format itself
    });

    // Verify result format
    const expectedBase64 = mockProcessedBuffer.toString('base64');
    expect(result).toBe(`data:image/webp;base64,${expectedBase64}`);
  });

  it('should return null when no thumbnail URL is provided', async () => {
    const result = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return null on fetch error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
    });

    // Use a unique URL to avoid cache hits from other tests
    const uniqueUrl = `https://example.com/video-fetch-error-${Date.now()}.jpg`;

    const result = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: uniqueUrl,
    });

    expect(result).toBe(null);
  });

  it('should return null on processing error', async () => {
    // Use a unique URL to avoid cache hits from other tests
    const uniqueUrl = `https://example.com/video-processing-error-${Date.now()}.jpg`;
    
    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
    });

    mockToBuffer.mockRejectedValue(new Error('Sharp processing failed'));

    const result = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: uniqueUrl,
    });

    expect(result).toBe(null);
  });
});

describe('getVideoThumbnailWebpUrlsBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default metadata response for batch processing too
    mockMetadata.mockResolvedValue({
      width: 1280,
      height: 720,
    });
  });

  it('should process multiple video thumbnails in batch', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-video-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    const thumbnailUrls = [
      'https://example.com/video1.jpg',
      'https://example.com/video2.jpg',
      null,
      'https://example.com/video3.jpg',
    ];

    const results = await getVideoThumbnailWebpUrlsBatch(thumbnailUrls);

    expect(results).toHaveLength(4);
    expect(results[0]).toContain('data:image/webp;base64,');
    expect(results[1]).toContain('data:image/webp;base64,');
    expect(results[2]).toBe(null); // null input should return null
    expect(results[3]).toContain('data:image/webp;base64,');

    // Verify fetch was called for non-null URLs
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should handle errors gracefully in batch processing', async () => {
    // Use unique URLs to avoid cache hits from other tests
    const uniqueUrl1 = `https://example.com/video-batch-1-${Date.now()}.jpg`;
    const uniqueUrl2 = `https://example.com/video-batch-2-${Date.now()}.jpg`;
    
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    mockToBuffer
      .mockResolvedValueOnce(Buffer.from('success-data'))
      .mockRejectedValueOnce(new Error('Processing failed'));

    const thumbnailUrls = [
      uniqueUrl1,
      uniqueUrl2,
    ];

    const results = await getVideoThumbnailWebpUrlsBatch(thumbnailUrls);

    expect(results).toHaveLength(2);
    expect(results[0]).toContain('data:image/webp;base64,');
    expect(results[1]).toBe(null); // Failed processing should return null
  });
});

describe('Image Processing Cache Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default metadata response
    mockMetadata.mockResolvedValue({
      width: 1280,
      height: 720,
    });
  });

  it('should cache processed playlist images', async () => {
    const imageProperties = {
      x: 10,
      y: 20,
      width: 100,
      height: 150,
    };

    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    // First call should process the image
    const result1 = await getCroppedPlaylistImageUrlServer({
      imageProperties,
      thumbnailMaxResUrl: 'https://example.com/cached-image.jpg',
      thumbnailUrl: null,
    });

    expect(result1).toContain('data:image/webp;base64,');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call should return cached result
    const result2 = await getCroppedPlaylistImageUrlServer({
      imageProperties,
      thumbnailMaxResUrl: 'https://example.com/cached-image.jpg',
      thumbnailUrl: null,
    });

    expect(result2).toBe(result1);
    // Fetch should not be called again
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should cache processed video thumbnails', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-video-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    // First call should process the image
    const result1 = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/cached-video-thumb.jpg',
    });

    expect(result1).toContain('data:image/webp;base64,');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call should return cached result
    const result2 = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/cached-video-thumb.jpg',
    });

    expect(result2).toBe(result1);
    // Fetch should not be called again
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should use different cache entries for different processing options', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer1 = Buffer.from('processed-webp-quality-90');
    const mockProcessedBuffer2 = Buffer.from('processed-webp-quality-70');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    // First call with quality 90
    mockToBuffer.mockResolvedValueOnce(mockProcessedBuffer1);
    const result1 = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/options-test.jpg',
      options: { quality: 90 },
    });

    // Second call with quality 70 (different options)
    mockToBuffer.mockResolvedValueOnce(mockProcessedBuffer2);
    const result2 = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/options-test.jpg',
      options: { quality: 70 },
    });

    expect(result1).not.toBe(result2);
    expect(global.fetch).toHaveBeenCalledTimes(2); // Different cache keys, both should fetch
  });

  it('should use auth-aware caching', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    // Create mock request with auth cookie
    const authRequest = {
      headers: new Map([
        ['cookie', 'sb-127-auth-token=valid-token; other=value'],
      ]),
    } as any;

    const anonRequest = {
      headers: new Map([['cookie', 'other=value']]),
    } as any;

    // Auth request
    const authResult = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/auth-test.jpg',
      request: authRequest,
    });

    // Anonymous request (should not use auth cache)
    const anonResult = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/auth-test.jpg',
      request: anonRequest,
    });

    expect(authResult).toContain('data:image/webp;base64,');
    expect(anonResult).toContain('data:image/webp;base64,');
    expect(global.fetch).toHaveBeenCalledTimes(2); // Different auth states, both should fetch
  });
});
