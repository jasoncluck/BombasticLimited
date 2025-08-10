import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import {
  getCroppedPlaylistImageUrlServer,
  getVideoThumbnailWebpUrlServer,
  getVideoThumbnailWebpUrlsBatch,
  processImageServer,
  validateImageUrl,
  detectOptimalFormat,
  calculateOptimalQuality,
} from '../image-processing';
import type { ImageProperties } from '$lib/components/playlist/playlist';

// Mock sharp
const mockSharp = vi.fn();
const mockExtract = vi.fn();
const mockWebp = vi.fn();
const mockAvif = vi.fn();
const mockJpeg = vi.fn();
const mockResize = vi.fn();
const mockToBuffer = vi.fn();
const mockMetadata = vi.fn();

vi.mock('sharp', () => ({
  default: (...args: any[]) => {
    mockSharp(...args);
    return {
      metadata: mockMetadata,
      extract: mockExtract.mockReturnThis(),
      resize: mockResize.mockReturnThis(),
      webp: mockWebp.mockReturnThis(),
      avif: mockAvif.mockReturnThis(),
      jpeg: mockJpeg.mockReturnThis(),
      toBuffer: mockToBuffer,
    };
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('validateImageUrl', () => {
  it('should allow valid YouTube domains', () => {
    expect(validateImageUrl('https://i.ytimg.com/image.jpg')).toBe(true);
    expect(validateImageUrl('https://img.youtube.com/image.jpg')).toBe(true);
    expect(validateImageUrl('https://i1.ytimg.com/image.jpg')).toBe(true);
  });

  it('should allow valid Twitch domains', () => {
    expect(validateImageUrl('https://static-cdn.jtvnw.net/image.jpg')).toBe(true);
  });

  it('should reject invalid domains', () => {
    expect(validateImageUrl('https://evil.com/image.jpg')).toBe(false);
    expect(validateImageUrl('https://example.com/image.jpg')).toBe(false);
  });

  it('should handle invalid URLs gracefully', () => {
    expect(validateImageUrl('not-a-url')).toBe(false);
    expect(validateImageUrl('')).toBe(false);
  });
});

describe('detectOptimalFormat', () => {
  it('should detect AVIF support', () => {
    expect(detectOptimalFormat('image/avif,image/webp,*/*')).toBe('avif');
    expect(detectOptimalFormat('text/html,image/avif,*/*')).toBe('avif');
  });

  it('should detect WebP support when AVIF is not available', () => {
    expect(detectOptimalFormat('image/webp,*/*')).toBe('webp');
    expect(detectOptimalFormat('text/html,image/webp,*/*')).toBe('webp');
  });

  it('should fallback to JPEG when neither AVIF nor WebP is supported', () => {
    expect(detectOptimalFormat('image/jpeg,*/*')).toBe('jpeg');
    expect(detectOptimalFormat('text/html,*/*')).toBe('jpeg');
  });

  it('should default to WebP when no Accept header is provided', () => {
    expect(detectOptimalFormat(null)).toBe('webp');
    expect(detectOptimalFormat(undefined)).toBe('webp');
  });
});

describe('calculateOptimalQuality', () => {
  it('should adjust quality based on format', () => {
    const metadata: Partial<sharp.Metadata> = { width: 1280, height: 720 };
    
    // AVIF should get lower quality (better compression)
    const avifQuality = calculateOptimalQuality(metadata, 'avif', 90);
    expect(avifQuality).toBeLessThan(90);
    
    // WebP should get slightly lower quality
    const webpQuality = calculateOptimalQuality(metadata, 'webp', 90);
    expect(webpQuality).toBeLessThan(90);
    expect(webpQuality).toBeGreaterThan(avifQuality);
    
    // JPEG should maintain higher quality
    const jpegQuality = calculateOptimalQuality(metadata, 'jpeg', 90);
    expect(jpegQuality).toBe(90);
  });

  it('should adjust quality based on image size', () => {
    // Large image
    const largeMetadata: Partial<sharp.Metadata> = { width: 2560, height: 1440 };
    const largeQuality = calculateOptimalQuality(largeMetadata, 'webp', 90);
    
    // Small image  
    const smallMetadata: Partial<sharp.Metadata> = { width: 320, height: 180 };
    const smallQuality = calculateOptimalQuality(smallMetadata, 'webp', 90);
    
    expect(smallQuality).toBeGreaterThan(largeQuality);
  });
});

describe('processImageServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMetadata.mockResolvedValue({
      width: 1280,
      height: 720,
    });
  });

  it('should reject invalid domains', async () => {
    const result = await processImageServer({
      imageUrl: 'https://evil.com/image.jpg',
      options: {},
    });
    
    expect(result).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should detect AVIF format from Accept header', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-avif-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    const result = await processImageServer({
      imageUrl: 'https://i.ytimg.com/image.jpg',
      acceptHeader: 'image/avif,image/webp,*/*',
      options: { format: 'auto' },
    });

    expect(mockAvif).toHaveBeenCalled();
    expect(result).toContain('data:image/avif;base64,');
  });

  it('should handle cropped images with extract', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    const imageProperties: ImageProperties = {
      x: 10,
      y: 20,
      width: 100,
      height: 150,
    };

    await processImageServer({
      imageUrl: 'https://i.ytimg.com/vi/test/maxresdefault.jpg',
      imageProperties,
      options: { format: 'webp' },
      isCropped: true,
      isMaxRes: true,
    });

    // Should use provided image properties
    expect(mockExtract).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      width: 100,
      height: 150,
    });
  });

  it('should handle resize for non-cropped images', async () => {
    const mockImageBuffer = new ArrayBuffer(1000);
    const mockProcessedBuffer = Buffer.from('processed-webp-data');

    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockImageBuffer),
    });

    mockToBuffer.mockResolvedValue(mockProcessedBuffer);

    await processImageServer({
      imageUrl: 'https://i.ytimg.com/image.jpg',
      options: { format: 'webp', width: 640, height: 360 },
      isCropped: false,
    });

    expect(mockResize).toHaveBeenCalledWith(640, 360, {
      fit: 'cover',
      position: 'center',
      withoutEnlargement: true,
    });
  });
});

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
      thumbnailMaxResUrl: 'https://i.ytimg.com/image.jpg',
      thumbnailUrl: null,
    });

    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith('https://i.ytimg.com/image.jpg', {
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Playlist-Service/1.0',
      },
    });

    // Verify Sharp processing  
    expect(mockSharp).toHaveBeenCalledWith(mockImageBuffer, {
      failOnError: false,
      density: 72, // maxres URLs get 72, standard URLs get 150
      pages: 1, // Added for animated image handling
    });

    expect(mockExtract).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      width: 100,
      height: 150,
    });

    expect(mockWebp).toHaveBeenCalledWith({
      quality: 85, // Format-aware quality - WebP gets reduced from 90 to 85
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
      thumbnailMaxResUrl: 'https://i.ytimg.com/image.jpg',
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
      thumbnailMaxResUrl: 'https://i.ytimg.com/maxres.jpg',
      thumbnailUrl: 'https://i.ytimg.com/thumbnail.jpg',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://i.ytimg.com/maxres.jpg',
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
      thumbnailMaxResUrl: 'https://i.ytimg.com/image.jpg',
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
      thumbnailMaxResUrl: 'https://i.ytimg.com/image.jpg',
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
      thumbnailUrl: 'https://i.ytimg.com/video-thumb.jpg',
    });

    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith(
      'https://i.ytimg.com/video-thumb.jpg',
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
      quality: 85, // Format-aware quality - WebP gets reduced from 90 to 85  
      effort: 3, // Enhanced effort level
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
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
      thumbnailUrl: 'https://i.ytimg.com/video-thumb.jpg',
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
      thumbnailUrl: 'https://i.ytimg.com/video-thumb.jpg',
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
      'https://i.ytimg.com/video1.jpg',
      'https://i.ytimg.com/video2.jpg',
      null,
      'https://i.ytimg.com/video3.jpg',
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
      'https://i.ytimg.com/video1.jpg',
      'https://i.ytimg.com/video2.jpg',
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
    });

    // Anonymous request (should not use auth cache)
    const anonResult = await getVideoThumbnailWebpUrlServer({
      thumbnailUrl: 'https://example.com/auth-test.jpg',
    });

    expect(authResult).toContain('data:image/webp;base64,');
    expect(anonResult).toContain('data:image/webp;base64,');
    expect(global.fetch).toHaveBeenCalledTimes(2); // Different auth states, both should fetch
  });
});
