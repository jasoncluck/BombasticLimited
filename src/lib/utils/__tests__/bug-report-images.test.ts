import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateImageFile,
  uploadBugReportImage,
  createImagePreview,
  revokeImagePreview,
  IMAGE_UPLOAD_CONFIG,
} from '../../components/bug-report/bug-report-images';

// Mock browser environment
vi.mock('$app/environment', () => ({
  browser: true,
}));

// Mock URL methods
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
global.URL = {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
} as any;

// Mock FileReader
class MockFileReader {
  onload: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  result: string | null = null;

  readAsDataURL(file: File) {
    // Simulate async file reading
    setTimeout(() => {
      this.result = `data:${file.type};base64,dGVzdGRhdGE=`; // "testdata" in base64
      if (this.onload) {
        this.onload({ target: this });
      }
    }, 0);
  }
}

global.FileReader = MockFileReader as any;

// Mock canvas and image for compression
const mockToBlob = vi.fn();
const mockDrawImage = vi.fn();
const mockGetContext = vi.fn();

// Properly type the mock context
const mockContext = {
  drawImage: mockDrawImage,
} as unknown as CanvasRenderingContext2D;

mockGetContext.mockReturnValue(mockContext);

global.HTMLCanvasElement.prototype.getContext = mockGetContext;
global.HTMLCanvasElement.prototype.toBlob = mockToBlob;

describe('bug-report-images utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    mockToBlob.mockImplementation((callback) => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      callback(blob);
    });
  });

  describe('validateImageFile', () => {
    it('should accept valid image files', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 }); // 1MB

      const result = validateImageFile(file);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject files that are too large', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 }); // 6MB

      const result = validateImageFile(file);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File size too large');
    });

    it('should reject invalid file types', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(file, 'size', { value: 1024 });

      const result = validateImageFile(file);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });
  });

  describe('uploadBugReportImage', () => {
    it('should successfully upload a valid small image', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1024 }); // 1KB

      const result = await uploadBugReportImage(file);

      expect(result.success).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.url).toContain('data:image/jpeg;base64,');
    });

    it('should handle file validation errors', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(file, 'size', { value: 1024 });

      const result = await uploadBugReportImage(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject files that are still too large after compression', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 3 * 1024 * 1024 }); // 3MB

      // Mock Image constructor and onload
      const mockImage = {
        onload: null as ((event: any) => void) | null,
        width: 1920,
        height: 1080,
        src: '',
      };

      global.Image = vi.fn(() => mockImage) as any;

      // Mock the compressed file to still be large
      mockToBlob.mockImplementation((callback) => {
        const largeBlob = new Blob([new ArrayBuffer(3 * 1024 * 1024)], {
          type: 'image/jpeg',
        });
        callback(largeBlob);
      });

      // Start the upload
      const uploadPromise = uploadBugReportImage(file);

      // Trigger image onload synchronously
      if (mockImage.onload) {
        mockImage.onload({});
      }

      const result = await uploadPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('still too large after compression');
    }, 10000);
  });

  describe('createImagePreview', () => {
    it('should create a preview URL', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const url = createImagePreview(file);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
      expect(url).toBe('blob:mock-url');
    });
  });

  describe('revokeImagePreview', () => {
    it('should revoke a preview URL', () => {
      const url = 'blob:mock-url';

      revokeImagePreview(url);

      expect(mockRevokeObjectURL).toHaveBeenCalledWith(url);
    });
  });

  describe('IMAGE_UPLOAD_CONFIG', () => {
    it('should have correct configuration values', () => {
      expect(IMAGE_UPLOAD_CONFIG.maxFileSize).toBe(5 * 1024 * 1024);
      expect(IMAGE_UPLOAD_CONFIG.maxImages).toBe(3);
      expect(IMAGE_UPLOAD_CONFIG.maxFileSizeMB).toBe(5);
      expect(IMAGE_UPLOAD_CONFIG.allowedTypes).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ]);
    });
  });
});
