import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../src/routes/api/playlist-image/+server';
import * as imageProcessing from '$lib/server/image-processing';

// Mock the image processing functions
vi.mock('$lib/server/image-processing', () => ({
  getCroppedPlaylistImageUrlServer: vi.fn(),
  detectOptimalFormat: vi.fn(),
  validateImageUrl: vi.fn(),
}));

vi.mock('$lib/components/playlist/playlist', () => ({
  parseImageProperties: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
}));

const mockGetCroppedPlaylistImageUrlServer = vi.mocked(imageProcessing.getCroppedPlaylistImageUrlServer);
const mockDetectOptimalFormat = vi.mocked(imageProcessing.detectOptimalFormat);
const mockValidateImageUrl = vi.mocked(imageProcessing.validateImageUrl);

describe('Playlist Image API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateImageUrl.mockReturnValue(true);
    mockDetectOptimalFormat.mockReturnValue('avif');
  });

  it('should process playlist image and return image response', async () => {
    const mockDataUrl = 'data:image/avif;base64,fake-image-data';
    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue(mockDataUrl);

    const url = new URL('http://localhost/api/playlist-image?url=https://i.ytimg.com/test.jpg&format=auto&quality=90&type=image');
    const request = new Request(url, {
      headers: { accept: 'image/avif,image/webp,image/*' }
    });

    const response = await GET({ url, request } as any);

    expect(mockGetCroppedPlaylistImageUrlServer).toHaveBeenCalledWith({
      imageProperties: null,
      thumbnailMaxResUrl: null,
      thumbnailUrl: 'https://i.ytimg.com/test.jpg',
      acceptHeader: 'image/avif,image/webp,image/*',
      options: {
        format: 'auto',
        quality: 90,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/avif');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('vary')).toBe('Accept');
  });

  it('should return JSON response when type=json', async () => {
    const mockDataUrl = 'data:image/avif;base64,fake-image-data';
    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue(mockDataUrl);

    const url = new URL('http://localhost/api/playlist-image?url=https://i.ytimg.com/test.jpg&format=auto&quality=90&type=json');
    const request = new Request(url, {
      headers: { accept: 'image/avif,image/webp,image/*' }
    });

    const response = await GET({ url, request } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    
    const data = await response.json();
    expect(data).toEqual({
      webpUrl: mockDataUrl,
      format: 'avif',
      originalUrl: 'https://i.ytimg.com/test.jpg',
    });
  });

  it('should handle image properties parameter', async () => {
    const mockDataUrl = 'data:image/avif;base64,fake-image-data';
    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue(mockDataUrl);

    const imageProps = JSON.stringify({ x: 10, y: 20, width: 200, height: 200 });
    const encodedProps = encodeURIComponent(imageProps);
    
    const url = new URL(`http://localhost/api/playlist-image?url=https://i.ytimg.com/test.jpg&imageProperties=${encodedProps}&type=image`);
    const request = new Request(url);

    const response = await GET({ url, request } as any);

    expect(mockGetCroppedPlaylistImageUrlServer).toHaveBeenCalledWith({
      imageProperties: { x: 0, y: 0, width: 100, height: 100 }, // Mocked return value
      thumbnailMaxResUrl: null,
      thumbnailUrl: 'https://i.ytimg.com/test.jpg',
      acceptHeader: null,
      options: {
        format: 'auto',
        quality: 90,
      },
    });

    expect(response.status).toBe(200);
  });
});