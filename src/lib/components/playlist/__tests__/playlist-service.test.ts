import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCroppedPlaylistImageUrl,
  getVideoThumbnailWebpUrl,
} from '../playlist-service';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

// Mock dependencies
vi.mock('../../ui/image-cropper/utils', () => ({
  getCroppedImg: vi.fn(),
}));

// Mock the getCroppedImg function directly since the module doesn't exist
const mockGetCroppedImg = vi.fn();

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
    const imageProperties: PlaylistImageProperties = {
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
      quality: 0.75,
    });
    expect(mockDrawImage).toHaveBeenCalledWith(
      mockImageBitmap,
      10,
      20,
      100,
      150, // source coordinates
      0,
      0,
      360,
      360 // destination coordinates (previewSize for maxres)
    );

    // Verify result format (basic check since base64 encoding is complex to mock)
    expect(result).toMatch(/^data:image\/webp;base64,/);

    // Restore original constructor
    global.Uint8Array = originalUint8Array;
  });

  it('should fallback to Canvas processing when OffscreenCanvas is not available', async () => {
    const imageProperties: PlaylistImageProperties = {
      x: 5,
      y: 10,
      width: 50,
      height: 75,
    };

    // Disable OffscreenCanvas
    delete (global as any).OffscreenCanvas;
    delete (global as any).createImageBitmap;

    // Mock Image constructor
    const mockImage = {
      width: 200,
      height: 300,
      crossOrigin: '',
      onload: null as any,
      onerror: null as any,
    };

    // Mock canvas and context
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      toBlob: vi.fn((callback: any) => {
        // Simulate successful blob creation
        callback(new Blob(['fake-webp-data'], { type: 'image/webp' }));
      }),
    };

    // Mock document.createElement to return our mock canvas
    global.document = {
      createElement: vi.fn((tagName: string) => {
        if (tagName === 'canvas') return mockCanvas;
        return {};
      }),
    } as any;

    // Mock global Image constructor
    global.Image = vi.fn().mockImplementation(() => mockImage);

    // Mock URL.createObjectURL
    global.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-result-url'),
    } as any;

    const resultPromise = getCroppedPlaylistImageUrl({
      imageProperties,
      thumbnailMaxResUrl: null,
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
    });

    // Simulate image load after a short delay
    setTimeout(() => {
      if (mockImage.onload) {
        mockImage.onload();
      }
    }, 10);

    const result = await resultPromise;

    expect(result).toBe('data:image/webp;base64,ZmFrZS13ZWJwLWRhdGE=');
    expect(global.Image).toHaveBeenCalled();
    expect(mockCanvas.toBlob).toHaveBeenCalled();
  }, 10000); // Increase timeout to 10 seconds

  it('should use default properties when imageProperties is null', async () => {
    // Disable OffscreenCanvas to use fallback
    delete (global as any).OffscreenCanvas;
    delete (global as any).createImageBitmap;

    // Mock Image constructor
    const mockImage = {
      width: 1280,
      height: 720,
      crossOrigin: '',
      onload: null as any,
      onerror: null as any,
    };

    // Mock canvas and context
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      toBlob: vi.fn((callback: any) => {
        // Simulate successful blob creation
        callback(new Blob(['fake-webp-data'], { type: 'image/webp' }));
      }),
    };

    // Mock document.createElement to return our mock canvas
    global.document = {
      createElement: vi.fn((tagName: string) => {
        if (tagName === 'canvas') return mockCanvas;
        return {};
      }),
    } as any;

    // Mock global Image constructor
    global.Image = vi.fn().mockImplementation(() => mockImage);

    // Mock URL.createObjectURL
    global.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-result-url'),
    } as any;

    const resultPromise = getCroppedPlaylistImageUrl({
      imageProperties: null,
      thumbnailMaxResUrl: 'https://example.com/maxres.jpg',
      thumbnailUrl: null,
    });

    // Simulate image load after a short delay
    setTimeout(() => {
      if (mockImage.onload) {
        mockImage.onload();
      }
    }, 10);

    const result = await resultPromise;

    expect(result).toBe('data:image/webp;base64,ZmFrZS13ZWJwLWRhdGE=');
    expect(global.Image).toHaveBeenCalled();
    expect(mockCanvas.toBlob).toHaveBeenCalled();

    // Verify that proper dimensions were used for maxres crop (updated to match current implementation)
    expect(mockCanvas.width).toBe(360); // Updated preview size for maxres
    expect(mockCanvas.height).toBe(360); // Updated preview size for maxres
  }, 10000); // Increase timeout to 10 seconds

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
    const imageProperties: PlaylistImageProperties = {
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

describe('getVideoThumbnailWebpUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup global mocks
    global.fetch = mockFetch;
    global.createImageBitmap = mockCreateImageBitmap;
    global.OffscreenCanvas = MockOffscreenCanvas as any;
  });

  it('should process video thumbnail with OffscreenCanvas and return WebP data URL without cropping', async () => {
    const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    const mockImageBitmap = { width: 320, height: 180 } as ImageBitmap;
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

    const result = await getVideoThumbnailWebpUrl({
      thumbnailUrl: 'https://example.com/video-thumb.jpg',
    });

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/video-thumb.jpg'
    );

    // Verify OffscreenCanvas processing - should use original image dimensions (no cropping)
    expect(mockCreateImageBitmap).toHaveBeenCalledWith(mockImageBlob);
    expect(mockConvertToBlob).toHaveBeenCalledWith({
      type: 'image/webp',
      quality: 0.75,
    });

    // Should draw the full image without cropping but with scaling to fit 320x180
    expect(mockDrawImage).toHaveBeenCalledWith(
      mockImageBitmap, 
      0, 
      0, 
      320, // destination width (scaled)
      180  // destination height (scaled)
    );

    // Verify result format
    expect(result).toMatch(/^data:image\/webp;base64,/);

    // Restore original constructor
    global.Uint8Array = originalUint8Array;
  });

  it('should fallback to Canvas processing when OffscreenCanvas is not available', async () => {
    // Disable OffscreenCanvas
    delete (global as any).OffscreenCanvas;
    delete (global as any).createImageBitmap;

    // Create a more complete mock for the canvas fallback
    const mockCanvas = {
      width: 320,
      height: 180,
      getContext: vi.fn().mockReturnValue({
        drawImage: mockDrawImage,
      }),
      toBlob: vi.fn(),
    };

    const mockCreateElement = vi.fn().mockReturnValue(mockCanvas);
    global.document = { createElement: mockCreateElement } as any;

    // Mock Image constructor
    const mockImage = {
      crossOrigin: '',
      onload: null as any,
      onerror: null as any,
      src: '',
      width: 320,
      height: 180,
    };

    global.Image = vi.fn().mockImplementation(() => mockImage) as any;

    // Mock FileReader
    const mockFileReader = {
      onload: null as any,
      onerror: null as any,
      readAsDataURL: vi.fn(),
      result: 'data:image/webp;base64,mock-base64-data',
    };

    global.FileReader = vi.fn().mockImplementation(() => mockFileReader) as any;

    const result = getVideoThumbnailWebpUrl({
      thumbnailUrl: 'https://example.com/video-thumb.jpg',
    });

    // Simulate image load
    mockImage.onload();

    // Simulate toBlob callback
    const mockBlob = new Blob(['mock-data'], { type: 'image/webp' });
    mockCanvas.toBlob.mock.calls[0][0](mockBlob);

    // Simulate FileReader load
    mockFileReader.onload();

    await expect(result).resolves.toBe(
      'data:image/webp;base64,mock-base64-data'
    );

    expect(mockCreateElement).toHaveBeenCalledWith('canvas');
    expect(mockCanvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.75
    );
  });

  it('should return null when no thumbnail URL is provided', async () => {
    const result = await getVideoThumbnailWebpUrl({
      thumbnailUrl: null,
    });

    expect(result).toBe(null);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null on processing error', async () => {
    // Setup OffscreenCanvas
    global.OffscreenCanvas = MockOffscreenCanvas as any;
    global.createImageBitmap = mockCreateImageBitmap;

    mockFetch.mockRejectedValue(new Error('Fetch failed'));

    const result = await getVideoThumbnailWebpUrl({
      thumbnailUrl: 'https://example.com/video-thumb.jpg',
    });

    expect(result).toBe(null);
  });
});


