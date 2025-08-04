import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCroppedPlaylistImageUrlServer } from '../image-processing';
import type { ImageProperties } from '$lib/components/playlist/playlist';

// Mock sharp
const mockSharp = vi.fn();
const mockExtract = vi.fn();
const mockWebp = vi.fn();
const mockToBuffer = vi.fn();

vi.mock('sharp', () => ({
  default: (...args: any[]) => {
    mockSharp(...args);
    return {
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
    });

    expect(mockExtract).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      width: 100,
      height: 150,
    });

    expect(mockWebp).toHaveBeenCalledWith({
      quality: 80,
      effort: 4,
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

    const result = await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: 'https://example.com/image.jpg',
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
  });

  it('should return null on processing error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
    });

    mockToBuffer.mockRejectedValue(new Error('Sharp processing failed'));

    const result = await getCroppedPlaylistImageUrlServer({
      imageProperties: null,
      thumbnailMaxResUrl: 'https://example.com/image.jpg',
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
  });
});
