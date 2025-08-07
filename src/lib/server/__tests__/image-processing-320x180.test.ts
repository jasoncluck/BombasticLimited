import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCroppedPlaylistImageUrlServer,
} from '../image-processing';
import type { ImageProperties } from '$lib/components/playlist/playlist';

// Mock sharp
const mockSharp = vi.fn();
const mockExtract = vi.fn();
const mockResize = vi.fn();
const mockSharpen = vi.fn();
const mockJpeg = vi.fn();
const mockWebp = vi.fn();
const mockToBuffer = vi.fn();
const mockMetadata = vi.fn();

vi.mock('sharp', () => ({
  default: (...args: any[]) => {
    mockSharp(...args);
    return {
      metadata: mockMetadata,
      extract: mockExtract.mockReturnThis(),
      resize: mockResize.mockReturnThis(),
      sharpen: mockSharpen.mockReturnThis(),
      jpeg: mockJpeg.mockReturnThis(),
      webp: mockWebp.mockReturnThis(),
      toBuffer: mockToBuffer,
    };
  },
  kernel: {
    lanczos3: 'lanczos3',
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('320x180 Thumbnail Processing Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default fetch response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
    });
    
    mockToBuffer.mockResolvedValue(Buffer.from('processed-image-data'));
  });

  describe('320x180 YouTube Medium Thumbnails', () => {
    beforeEach(() => {
      // Set metadata for 320x180 YouTube medium thumbnail
      mockMetadata.mockResolvedValue({
        width: 320,
        height: 180,
      });
    });

    it('should use improved cropping strategy for 320x180 thumbnails', async () => {
      await getCroppedPlaylistImageUrlServer({
        imageProperties: null, // Use defaults
        thumbnailMaxResUrl: null,
        thumbnailUrl: 'https://example.com/320x180.jpg',
      });

      // Should still crop but with less aggressive strategy
      expect(mockExtract).toHaveBeenCalledWith(
        expect.objectContaining({
          // Check that crop is less aggressive than the old 180x180
          left: expect.any(Number),
          top: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        })
      );
    });

    it('should upscale to larger target size for better quality', async () => {
      await getCroppedPlaylistImageUrlServer({
        imageProperties: null,
        thumbnailMaxResUrl: null,
        thumbnailUrl: 'https://example.com/320x180.jpg',
      });

      // Should upscale to at least 320px (larger than old 224px target)
      expect(mockResize).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          kernel: 'lanczos3',
          fit: 'fill',
        })
      );

      const resizeCall = mockResize.mock.calls[0];
      const targetWidth = resizeCall[0];
      const targetHeight = resizeCall[1];
      
      // Target should be at least 320px (improvement over 224px)
      expect(targetWidth).toBeGreaterThanOrEqual(320);
      expect(targetHeight).toBeGreaterThanOrEqual(320);
    });

    it('should apply sharpening after upscaling for 320x180 thumbnails', async () => {
      await getCroppedPlaylistImageUrlServer({
        imageProperties: null,
        thumbnailMaxResUrl: null,
        thumbnailUrl: 'https://example.com/320x180.jpg',
      });

      // Should apply sharpening for upscaled images
      expect(mockSharpen).toHaveBeenCalled();
    });

    it('should use high quality JPEG settings for upscaled 320x180 images', async () => {
      await getCroppedPlaylistImageUrlServer({
        imageProperties: null,
        thumbnailMaxResUrl: null,
        thumbnailUrl: 'https://example.com/320x180.jpg',
      });

      // Should use high quality JPEG settings
      expect(mockJpeg).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: expect.any(Number),
          progressive: true,
          mozjpeg: true,
        })
      );

      const jpegCall = mockJpeg.mock.calls[0];
      const quality = jpegCall[0].quality;
      
      // Quality should be high for upscaled images
      expect(quality).toBeGreaterThanOrEqual(95);
    });
  });

  describe('Other thumbnail sizes should remain unchanged', () => {
    it('should maintain existing behavior for 480x360 thumbnails', async () => {
      mockMetadata.mockResolvedValue({
        width: 480,
        height: 360,
      });

      await getCroppedPlaylistImageUrlServer({
        imageProperties: null,
        thumbnailMaxResUrl: null,
        thumbnailUrl: 'https://example.com/480x360.jpg',
      });

      // Should crop to 360x360 as before
      expect(mockExtract).toHaveBeenCalledWith({
        left: 60, // (480-360)/2
        top: 0,
        width: 360,
        height: 360,
      });
    });

    it('should maintain existing behavior for 120x90 thumbnails', async () => {
      mockMetadata.mockResolvedValue({
        width: 120,
        height: 90,
      });

      await getCroppedPlaylistImageUrlServer({
        imageProperties: null,
        thumbnailMaxResUrl: null,
        thumbnailUrl: 'https://example.com/120x90.jpg',
      });

      // Should crop to 90x90 as before
      expect(mockExtract).toHaveBeenCalledWith({
        left: 15, // (120-90)/2
        top: 0,
        width: 90,
        height: 90,
      });
    });

    it('should maintain existing behavior for maxres images', async () => {
      mockMetadata.mockResolvedValue({
        width: 1280,
        height: 720,
      });

      await getCroppedPlaylistImageUrlServer({
        imageProperties: null,
        thumbnailMaxResUrl: 'https://example.com/maxres.jpg',
        thumbnailUrl: null,
      });

      // Should use WebP for maxres images
      expect(mockWebp).toHaveBeenCalled();
      expect(mockJpeg).not.toHaveBeenCalled();
    });
  });
});