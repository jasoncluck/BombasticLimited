import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCroppedPlaylistImageUrl } from '../playlist-service';
import type { ImageProperties } from '../playlist';

// Mock dependencies
vi.mock('../../ui/image-cropper/utils', () => ({
  getCroppedImg: vi.fn(),
}));

const mockGetCroppedImg = vi.mocked(
  await import('../../ui/image-cropper/utils')
).getCroppedImg;

// Mock globals
const mockCreateImageBitmap = vi.fn();
const mockFetch = vi.fn();
const mockConvertToBlob = vi.fn();
const mockGetContext = vi.fn();
const mockDrawImage = vi.fn();

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      drawImage: mockDrawImage,
    };
  }

  convertToBlob = mockConvertToBlob;
}

describe('getCroppedPlaylistImageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup global mocks
    global.fetch = mockFetch;
    global.createImageBitmap = mockCreateImageBitmap;
    global.OffscreenCanvas = MockOffscreenCanvas as any;
  });

  it('should process image with OffscreenCanvas and return WebP data URL', async () => {
    const imageProperties: ImageProperties = {
      x: 10,
      y: 20,
      width: 100,
      height: 150,
    };

    const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    const mockImageBitmap = { width: 200, height: 300 } as ImageBitmap;
    const mockWebpBlob = new Blob(['fake-webp-data'], { type: 'image/webp' });

    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockImageBlob),
    });

    mockCreateImageBitmap.mockResolvedValue(mockImageBitmap);
    mockGetContext.mockReturnValue({ drawImage: mockDrawImage });

    // Mock ArrayBuffer and base64 conversion
    const mockArrayBuffer = new ArrayBuffer(8);
    const mockUint8Array = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    mockWebpBlob.arrayBuffer = vi.fn().mockResolvedValue(mockArrayBuffer);
    Object.defineProperty(mockArrayBuffer, 'length', { value: 8 });

    // Mock the Uint8Array constructor to return our mock
    const originalUint8Array = global.Uint8Array;
    global.Uint8Array = vi.fn().mockReturnValue(mockUint8Array) as any;

    mockConvertToBlob.mockResolvedValue(mockWebpBlob);

    const result = await getCroppedPlaylistImageUrl({
      imageProperties,
      thumbnailMaxResUrl: 'https://example.com/image.jpg',
      thumbnailUrl: null,
    });

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.jpg');

    // Verify OffscreenCanvas processing
    expect(mockCreateImageBitmap).toHaveBeenCalledWith(mockImageBlob);
    expect(mockConvertToBlob).toHaveBeenCalledWith({
      type: 'image/webp',
      quality: 0.8,
    });
    expect(mockDrawImage).toHaveBeenCalledWith(
      mockImageBitmap,
      10,
      20,
      100,
      150, // source coordinates
      0,
      0,
      100,
      150 // destination coordinates
    );

    // Verify result format (basic check since base64 encoding is complex to mock)
    expect(result).toMatch(/^data:image\/webp;base64,/);

    // Restore original constructor
    global.Uint8Array = originalUint8Array;
  });

  it('should fallback to Canvas processing when OffscreenCanvas is not available', async () => {
    const imageProperties: ImageProperties = {
      x: 5,
      y: 10,
      width: 50,
      height: 75,
    };

    // Disable OffscreenCanvas
    delete (global as any).OffscreenCanvas;
    delete (global as any).createImageBitmap;

    const mockCroppedUrl = 'blob:mock-cropped-image-url';
    mockGetCroppedImg.mockResolvedValue(mockCroppedUrl);

    const result = await getCroppedPlaylistImageUrl({
      imageProperties,
      thumbnailMaxResUrl: null,
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
    });

    expect(mockGetCroppedImg).toHaveBeenCalledWith(
      'https://example.com/thumbnail.jpg',
      imageProperties
    );
    expect(result).toBe(mockCroppedUrl);
  });

  it('should use default properties when imageProperties is null', async () => {
    // Disable OffscreenCanvas to use fallback
    delete (global as any).OffscreenCanvas;
    delete (global as any).createImageBitmap;

    const mockCroppedUrl = 'blob:mock-cropped-image-url';
    mockGetCroppedImg.mockResolvedValue(mockCroppedUrl);

    await getCroppedPlaylistImageUrl({
      imageProperties: null,
      thumbnailMaxResUrl: 'https://example.com/maxres.jpg',
      thumbnailUrl: null,
    });

    // Should use PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
    expect(mockGetCroppedImg).toHaveBeenCalledWith(
      'https://example.com/maxres.jpg',
      {
        x: 280,
        y: 0,
        height: 720,
        width: 720,
      }
    );
  });

  it('should return null when no image URL is provided', async () => {
    const result = await getCroppedPlaylistImageUrl({
      imageProperties: null,
      thumbnailMaxResUrl: null,
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetCroppedImg).not.toHaveBeenCalled();
  });

  it('should return null on processing error', async () => {
    const imageProperties: ImageProperties = {
      x: 10,
      y: 20,
      width: 100,
      height: 150,
    };

    // Setup OffscreenCanvas
    global.OffscreenCanvas = MockOffscreenCanvas as any;
    global.createImageBitmap = mockCreateImageBitmap;

    mockFetch.mockRejectedValue(new Error('Fetch failed'));

    const result = await getCroppedPlaylistImageUrl({
      imageProperties,
      thumbnailMaxResUrl: 'https://example.com/image.jpg',
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
  });
});
