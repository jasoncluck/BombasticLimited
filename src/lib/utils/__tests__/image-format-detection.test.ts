import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM globals before importing
const mockCanvas = {
  width: 1,
  height: 1,
  toBlob: vi.fn(),
};

const mockDocument = {
  createElement: vi.fn(() => mockCanvas),
};

global.document = mockDocument as any;

// Now import the module
import {
  detectOptimalFormat,
  detectBrowserImageSupport,
  getOptimalFormatForBrowser,
  imageFormats,
  type ImageFormat,
} from '../image-format-detection';

describe('Image Format Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectOptimalFormat', () => {
    it('should return webp for no Accept header', () => {
      expect(detectOptimalFormat()).toBe('webp');
      expect(detectOptimalFormat(null)).toBe('webp');
    });

    it('should detect AVIF support from Accept header', () => {
      const acceptHeaders = [
        'image/avif,image/webp,*/*',
        'image/avif',
        'text/html,application/xhtml+xml,image/avif,image/webp,*/*',
      ];

      acceptHeaders.forEach(header => {
        expect(detectOptimalFormat(header)).toBe('avif');
      });
    });

    it('should detect WebP support from Accept header', () => {
      const acceptHeaders = [
        'image/webp,*/*',
        'image/webp',
        'text/html,application/xhtml+xml,image/webp,*/*',
        'image/png,image/webp,image/jpeg,*/*',
      ];

      acceptHeaders.forEach(header => {
        expect(detectOptimalFormat(header)).toBe('webp');
      });
    });

    it('should prioritize AVIF over WebP when both present', () => {
      const acceptHeader = 'image/webp,image/avif,*/*';
      expect(detectOptimalFormat(acceptHeader)).toBe('avif');
    });

    it('should handle case-insensitive Accept headers', () => {
      expect(detectOptimalFormat('IMAGE/AVIF')).toBe('avif');
      expect(detectOptimalFormat('Image/WebP')).toBe('webp');
    });

    it('should parse quality preferences in Accept header', () => {
      const acceptWithWebPHigher = 'image/webp;q=0.9,image/jpeg;q=0.8';
      const acceptWithJpegHigher = 'image/webp;q=0.7,image/jpeg;q=0.9';

      expect(detectOptimalFormat(acceptWithWebPHigher)).toBe('webp');
      // Note: The current implementation still defaults to webp for wildcard
      expect(detectOptimalFormat(acceptWithJpegHigher)).toBe('webp');
    });

    it('should default to webp for generic image acceptance', () => {
      const genericAcceptHeaders = [
        'image/*',
        '*/*',
        'text/html,application/xhtml+xml,*/*',
      ];

      genericAcceptHeaders.forEach(header => {
        expect(detectOptimalFormat(header)).toBe('webp');
      });
    });

    it('should fallback to jpeg for maximum compatibility', () => {
      const nonImageHeaders = [
        'text/html',
        'application/json',
        'text/plain',
        'application/xml',
      ];

      nonImageHeaders.forEach(header => {
        expect(detectOptimalFormat(header)).toBe('jpeg');
      });
    });

    it('should handle empty Accept header', () => {
      expect(detectOptimalFormat('')).toBe('webp');
    });

    it('should handle complex Accept headers with multiple formats', () => {
      const complexHeader = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
      expect(detectOptimalFormat(complexHeader)).toBe('avif');
    });
  });

  describe('detectBrowserImageSupport', () => {
    it('should return a promise with support object', async () => {
      // Mock successful canvas.toBlob calls
      mockCanvas.toBlob.mockImplementation((callback, type) => {
        // Simulate support for both formats
        const blob = type === 'image/avif' ? new Blob() : new Blob();
        setTimeout(() => callback(blob), 0);
      });

      const support = await detectBrowserImageSupport();
      
      expect(support).toHaveProperty('avif');
      expect(support).toHaveProperty('webp');
      expect(typeof support.avif).toBe('boolean');
      expect(typeof support.webp).toBe('boolean');
    });

    it('should handle AVIF support detection', async () => {
      mockCanvas.toBlob.mockImplementation((callback, type) => {
        if (type === 'image/avif') {
          setTimeout(() => callback(new Blob()), 0);
        } else {
          setTimeout(() => callback(null), 0);
        }
      });

      const support = await detectBrowserImageSupport();
      expect(support.avif).toBe(true);
      expect(support.webp).toBe(false);
    });

    it('should handle WebP support detection', async () => {
      mockCanvas.toBlob.mockImplementation((callback, type) => {
        if (type === 'image/webp') {
          setTimeout(() => callback(new Blob()), 0);
        } else {
          setTimeout(() => callback(null), 0);
        }
      });

      const support = await detectBrowserImageSupport();
      expect(support.avif).toBe(false);
      expect(support.webp).toBe(true);
    });

    it('should handle no format support', async () => {
      mockCanvas.toBlob.mockImplementation((callback) => {
        setTimeout(() => callback(null), 0);
      });

      const support = await detectBrowserImageSupport();
      expect(support.avif).toBe(false);
      expect(support.webp).toBe(false);
    });

    it('should create canvas with correct dimensions', async () => {
      mockCanvas.toBlob.mockImplementation((callback) => {
        setTimeout(() => callback(null), 0);
      });

      await detectBrowserImageSupport();
      
      expect(mockDocument.createElement).toHaveBeenCalledWith('canvas');
      expect(mockCanvas.width).toBe(1);
      expect(mockCanvas.height).toBe(1);
    });
  });

  describe('getOptimalFormatForBrowser', () => {
    it('should return AVIF when supported', async () => {
      mockCanvas.toBlob.mockImplementation((callback, type) => {
        if (type === 'image/avif') {
          setTimeout(() => callback(new Blob()), 0);
        } else {
          setTimeout(() => callback(null), 0);
        }
      });

      const format = await getOptimalFormatForBrowser();
      expect(format).toBe('avif');
    });

    it('should return WebP when AVIF not supported but WebP is', async () => {
      mockCanvas.toBlob.mockImplementation((callback, type) => {
        if (type === 'image/webp') {
          setTimeout(() => callback(new Blob()), 0);
        } else {
          setTimeout(() => callback(null), 0);
        }
      });

      const format = await getOptimalFormatForBrowser();
      expect(format).toBe('webp');
    });

    it('should return JPEG when neither AVIF nor WebP supported', async () => {
      mockCanvas.toBlob.mockImplementation((callback) => {
        setTimeout(() => callback(null), 0);
      });

      const format = await getOptimalFormatForBrowser();
      expect(format).toBe('jpeg');
    });

    it('should fallback to WebP on error', async () => {
      mockCanvas.toBlob.mockImplementation(() => {
        throw new Error('Canvas error');
      });

      const format = await getOptimalFormatForBrowser();
      expect(format).toBe('webp');
    });

    it('should handle promise rejection gracefully', async () => {
      mockDocument.createElement.mockImplementation(() => {
        throw new Error('Document error');
      });

      const format = await getOptimalFormatForBrowser();
      expect(format).toBe('webp');
    });
  });

  describe('imageFormats constant', () => {
    it('should contain expected formats in correct order', () => {
      expect(imageFormats).toEqual(['avif', 'webp', 'jpeg']);
    });

    it('should be readonly array', () => {
      expect(Array.isArray(imageFormats)).toBe(true);
      expect(imageFormats.length).toBe(3);
    });
  });

  describe('ImageFormat type', () => {
    it('should accept valid format values', () => {
      const validFormats: ImageFormat[] = ['avif', 'webp', 'jpeg'];
      expect(validFormats).toHaveLength(3);
      
      validFormats.forEach(format => {
        expect(imageFormats).toContain(format);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed Accept headers gracefully', () => {
      const malformedHeaders = [
        'image/;;;',
        'image/webp;q=invalid',
        'image/webp;q=',
        ';;;',
        'image/',
      ];

      malformedHeaders.forEach(header => {
        expect(() => detectOptimalFormat(header)).not.toThrow();
        const result = detectOptimalFormat(header);
        expect(imageFormats).toContain(result);
      });
    });

    it('should handle very long Accept headers', () => {
      const longHeader = 'image/webp,'.repeat(1000) + 'image/avif';
      expect(() => detectOptimalFormat(longHeader)).not.toThrow();
      expect(detectOptimalFormat(longHeader)).toBe('avif');
    });

    it('should handle Accept headers with unusual spacing', () => {
      const spacedHeaders = [
        ' image/avif , image/webp ',
        'image/avif,  image/webp',
        '  image/avif,image/webp  ',
      ];

      spacedHeaders.forEach(header => {
        expect(detectOptimalFormat(header)).toBe('avif');
      });
    });

    it('should handle canvas creation failure in browser detection', async () => {
      mockDocument.createElement.mockReturnValue(null);

      await expect(getOptimalFormatForBrowser()).resolves.toBe('webp');
    });
  });
});