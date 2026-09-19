import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteObjectMock = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/s3', () => ({
  CONTENT_IMAGES_BUCKET: 'content-images',
  deleteObject: deleteObjectMock,
}));

const { dataURLtoFile, deletePlaylistImage } = await import('../image-upload');

// Mock global dependencies
global.atob = vi.fn();

describe('image-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dataURLtoFile', () => {
    beforeEach(() => {
      // Mock atob to return a known byte string
      vi.mocked(global.atob).mockReturnValue('test-binary-data');
    });

    it('should convert a valid data URL to a File object', () => {
      const dataURL = 'data:image/jpeg;base64,dGVzdA==';
      const filename = 'test-image.jpg';

      const file = dataURLtoFile(dataURL, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(filename);
      expect(file.type).toBe('image/jpeg');
      expect(global.atob).toHaveBeenCalledWith('dGVzdA==');
    });

    it('should handle PNG data URLs', () => {
      const dataURL = 'data:image/png;base64,dGVzdA==';
      const filename = 'test-image.png';

      const file = dataURLtoFile(dataURL, filename);

      expect(file.type).toBe('image/png');
      expect(file.name).toBe(filename);
    });

    it('should use the extracted MIME type even if invalid', () => {
      const dataURL = 'data:invalid;base64,dGVzdA==';
      const filename = 'test-image.jpg';

      const file = dataURLtoFile(dataURL, filename);

      expect(file.type).toBe('invalid');
    });

    it('should handle data URLs without MIME type', () => {
      const dataURL = 'data:;base64,dGVzdA==';
      const filename = 'test-image.jpg';

      const file = dataURLtoFile(dataURL, filename);

      expect(file.type).toBe('image/jpeg');
    });

    it('should create file with correct size based on binary data', () => {
      const binaryString = 'test-data-12345';
      vi.mocked(global.atob).mockReturnValue(binaryString);

      const dataURL = 'data:image/jpeg;base64,dGVzdA==';
      const filename = 'test-image.jpg';

      const file = dataURLtoFile(dataURL, filename);

      expect(file.size).toBe(binaryString.length);
    });

    it('should handle empty base64 data', () => {
      vi.mocked(global.atob).mockReturnValue('');

      const dataURL = 'data:image/jpeg;base64,';
      const filename = 'test-image.jpg';

      const file = dataURLtoFile(dataURL, filename);

      expect(file.size).toBe(0);
      expect(file.name).toBe(filename);
    });

    it('should work with different file extensions', () => {
      const testCases = [
        {
          dataURL: 'data:image/webp;base64,dGVzdA==',
          filename: 'test.webp',
          expectedType: 'image/webp',
        },
        {
          dataURL: 'data:image/gif;base64,dGVzdA==',
          filename: 'test.gif',
          expectedType: 'image/gif',
        },
        {
          dataURL: 'data:image/svg+xml;base64,dGVzdA==',
          filename: 'test.svg',
          expectedType: 'image/svg+xml',
        },
      ];

      testCases.forEach(({ dataURL, filename, expectedType }) => {
        const file = dataURLtoFile(dataURL, filename);
        expect(file.type).toBe(expectedType);
        expect(file.name).toBe(filename);
      });
    });
  });

  describe('deletePlaylistImage', () => {
    beforeEach(() => {
      deleteObjectMock.mockReset();
    });

    it('should successfully delete an image', async () => {
      deleteObjectMock.mockResolvedValue(undefined);

      const result = await deletePlaylistImage({
        imagePath: 'test-image.jpg',
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(deleteObjectMock).toHaveBeenCalledWith(
        'content-images',
        'test-image.jpg'
      );
    });

    it('should handle network or unexpected errors', async () => {
      const networkError = new Error('Network connection failed');
      deleteObjectMock.mockRejectedValue(networkError);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await deletePlaylistImage({
        imagePath: 'test-image.jpg',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection failed');
      expect(consoleSpy).toHaveBeenCalledWith('Deletion error:', networkError);

      consoleSpy.mockRestore();
    });

    it('should handle unknown error types', async () => {
      deleteObjectMock.mockRejectedValue('String error');

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await deletePlaylistImage({
        imagePath: 'test-image.jpg',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');

      consoleSpy.mockRestore();
    });

    it('should work with different image paths', async () => {
      deleteObjectMock.mockResolvedValue(undefined);

      const imagePaths = [
        'folder/subfolder/image.jpg',
        'playlist-images/123/thumbnail.png',
        'uploads/user-1/profile.webp',
      ];

      for (const imagePath of imagePaths) {
        const result = await deletePlaylistImage({ imagePath });

        expect(result.success).toBe(true);
        expect(deleteObjectMock).toHaveBeenCalledWith(
          'content-images',
          imagePath
        );
      }
    });

    it('should handle empty image path', async () => {
      deleteObjectMock.mockResolvedValue(undefined);

      const result = await deletePlaylistImage({ imagePath: '' });

      expect(deleteObjectMock).toHaveBeenCalledWith('content-images', '');
      expect(result.success).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete image upload workflow', () => {
      // Test the typical workflow of converting data URL to file
      const mockBase64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const decodedData = atob(mockBase64Data);
      vi.mocked(global.atob).mockReturnValue(decodedData);

      const dataURL = `data:image/png;base64,${mockBase64Data}`;
      const filename = 'test-upload.png';

      const file = dataURLtoFile(dataURL, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe('image/png');
      expect(file.name).toBe(filename);
      expect(file.size).toBe(decodedData.length);
    });

    it('should maintain file integrity across conversions', () => {
      const testData = 'binary-file-content-test-123';
      vi.mocked(global.atob).mockReturnValue(testData);

      const dataURL =
        'data:image/jpeg;base64,YmluYXJ5LWZpbGUtY29udGVudC10ZXN0LTEyMw==';
      const filename = 'integrity-test.jpg';

      const file = dataURLtoFile(dataURL, filename);

      expect(file.size).toBe(testData.length);
      expect(file.type).toBe('image/jpeg');
      expect(file.name).toBe(filename);
    });
  });
});
