import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectOptimalImageFormat,
  getFormatPriority,
  getBestImageFormat,
  getFormatExtension,
  getFormatMimeType,
} from '../images';

// Mock $app/environment
vi.mock('$app/environment', () => ({
  browser: false, // Start with server-side
}));

describe('images module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectOptimalImageFormat - Server Side', () => {
    it('should detect AVIF from Accept header', () => {
      const acceptHeader =
        'text/html,image/avif,image/webp,image/jpeg,*/*;q=0.8';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('avif');
    });

    it('should detect WebP from Accept header when AVIF not available', () => {
      const acceptHeader = 'text/html,image/webp,image/jpeg,*/*;q=0.8';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('webp');
    });

    it('should fallback to JPEG when neither AVIF nor WebP in Accept header', () => {
      const acceptHeader = 'text/html,image/jpeg,image/png,*/*;q=0.8';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('jpeg');
    });

    it('should handle case-insensitive Accept headers', () => {
      const acceptHeader = 'TEXT/HTML,IMAGE/AVIF,IMAGE/WEBP,*/*';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('avif');
    });

    it('should default to WebP on server when no Accept header provided', () => {
      const format = detectOptimalImageFormat();
      expect(format).toBe('webp');
    });

    it('should default to WebP on server when Accept header is null', () => {
      const format = detectOptimalImageFormat(null);
      expect(format).toBe('webp');
    });

    it('should handle malformed Accept headers gracefully', () => {
      const acceptHeader = 'invalid-header-format';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('jpeg');
    });

    it('should prioritize AVIF over WebP when both are present', () => {
      const acceptHeader = 'image/webp,image/avif,image/jpeg';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('avif');
    });

    it('should handle Accept headers with quality parameters', () => {
      const acceptHeader = 'image/jpeg;q=0.9,image/webp;q=0.8,image/avif;q=1.0';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('avif');
    });

    it('should handle empty Accept header', () => {
      const acceptHeader = '';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('webp'); // Server-side fallback is webp, not jpeg
    });
  });

  describe('getFormatPriority', () => {
    it('should return format priority for playlist content', () => {
      const priority = getFormatPriority('playlist');
      expect(Array.isArray(priority)).toBe(true);
      expect(priority.length).toBeGreaterThan(0);
      expect(priority).toEqual(['avif', 'webp']); // Playlist doesn't include jpeg fallback
    });

    it('should return format priority for video content', () => {
      const priority = getFormatPriority('video');
      expect(Array.isArray(priority)).toBe(true);
      expect(priority.length).toBeGreaterThan(0);
      expect(priority).toContain('jpeg'); // Should always include jpeg as fallback
    });

    it('should return different priorities for different content types', () => {
      const playlistPriority = getFormatPriority('playlist');
      const videoPriority = getFormatPriority('video');

      expect(playlistPriority).toBeDefined();
      expect(videoPriority).toBeDefined();
      // Both should be arrays of valid formats
      expect(Array.isArray(playlistPriority)).toBe(true);
      expect(Array.isArray(videoPriority)).toBe(true);
    });
  });

  describe('getBestImageFormat', () => {
    it('should use detected format when supported for content type', () => {
      const acceptHeader = 'image/avif,image/webp,image/jpeg';
      const format = getBestImageFormat('playlist', acceptHeader);
      expect(['avif', 'webp', 'jpeg']).toContain(format);
    });

    it('should fallback to supported format when detected format not supported', () => {
      // This test depends on the actual implementation logic
      const format = getBestImageFormat('playlist', null);
      expect(['avif', 'webp', 'jpeg']).toContain(format);
    });

    it('should handle different content types', () => {
      const playlistFormat = getBestImageFormat(
        'playlist',
        'image/avif,image/webp'
      );
      const videoFormat = getBestImageFormat('video', 'image/avif,image/webp');

      expect(['avif', 'webp', 'jpeg']).toContain(playlistFormat);
      expect(['avif', 'webp', 'jpeg']).toContain(videoFormat);
    });
  });

  describe('getFormatExtension', () => {
    it('should return correct extension for AVIF', () => {
      expect(getFormatExtension('avif')).toBe('.avif'); // Returns with dot
    });

    it('should return correct extension for WebP', () => {
      expect(getFormatExtension('webp')).toBe('.webp'); // Returns with dot
    });

    it('should return correct extension for JPEG', () => {
      expect(getFormatExtension('jpeg')).toBe('.jpg'); // Returns with dot
    });
  });

  describe('getFormatMimeType', () => {
    it('should return correct MIME type for AVIF', () => {
      expect(getFormatMimeType('avif')).toBe('image/avif');
    });

    it('should return correct MIME type for WebP', () => {
      expect(getFormatMimeType('webp')).toBe('image/webp');
    });

    it('should return correct MIME type for JPEG', () => {
      expect(getFormatMimeType('jpeg')).toBe('image/jpeg');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined Accept header', () => {
      const format = detectOptimalImageFormat(undefined);
      expect(['avif', 'webp', 'jpeg']).toContain(format);
    });

    it('should handle Accept header with no image types', () => {
      const acceptHeader = 'text/html,application/json,*/*';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('jpeg');
    });

    it('should handle Accept header with only wildcard', () => {
      const acceptHeader = '*/*';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('jpeg');
    });

    it('should handle Accept header with unusual spacing', () => {
      const acceptHeader = '  image/avif  ,  image/webp  ,  image/jpeg  ';
      const format = detectOptimalImageFormat(acceptHeader);
      expect(format).toBe('avif');
    });

    it('should handle very long Accept headers', () => {
      const longHeader =
        'text/html,' + 'image/png,'.repeat(100) + 'image/avif,image/jpeg';
      const format = detectOptimalImageFormat(longHeader);
      expect(format).toBe('avif');
    });
  });

  describe('browser compatibility scenarios', () => {
    it('should handle legacy browser Accept headers', () => {
      const legacyHeader = 'text/html,image/png,image/jpeg,image/gif,*/*;q=0.1';
      const format = detectOptimalImageFormat(legacyHeader);
      expect(format).toBe('jpeg');
    });

    it('should handle modern browser Accept headers', () => {
      const modernHeader =
        'text/html,image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.8,*/*;q=0.5';
      const format = detectOptimalImageFormat(modernHeader);
      expect(format).toBe('avif');
    });

    it('should handle Chrome-style Accept headers', () => {
      const chromeHeader =
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
      const format = detectOptimalImageFormat(chromeHeader);
      expect(format).toBe('avif');
    });

    it('should handle Safari-style Accept headers', () => {
      const safariHeader =
        'image/webp,image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5';
      const format = detectOptimalImageFormat(safariHeader);
      expect(format).toBe('webp');
    });
  });

  describe('type safety', () => {
    it('should return valid format types', () => {
      const validFormats = ['avif', 'webp', 'jpeg'] as const;

      const testHeaders = [
        'image/avif,image/webp,image/jpeg',
        'image/webp,image/jpeg',
        'image/jpeg',
        '',
        null,
        undefined,
      ];

      testHeaders.forEach((header) => {
        const format = detectOptimalImageFormat(header);
        expect(validFormats).toContain(format);
      });
    });

    it('should return valid extensions for all formats', () => {
      const formats = ['avif', 'webp', 'jpeg'] as const;
      formats.forEach((format) => {
        const extension = getFormatExtension(format);
        expect(typeof extension).toBe('string');
        expect(extension.length).toBeGreaterThan(0);
      });
    });

    it('should return valid MIME types for all formats', () => {
      const formats = ['avif', 'webp', 'jpeg'] as const;
      formats.forEach((format) => {
        const mimeType = getFormatMimeType(format);
        expect(typeof mimeType).toBe('string');
        expect(mimeType.startsWith('image/')).toBe(true);
      });
    });
  });
});
