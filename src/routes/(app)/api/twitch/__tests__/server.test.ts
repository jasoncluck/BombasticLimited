import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '$lib/constants/source.js';

// Mock the twitch poller  
const mockGetActiveStreams = vi.fn();

vi.mock('$lib/server/twitch-poller.js', () => ({
  getActiveStreams: mockGetActiveStreams,
}));

describe('/api/twitch endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveStreams.mockClear().mockReturnValue([]);
  });

  it('should export GET function', async () => {
    const module = await import('../+server.js');

    expect(typeof module.GET).toBe('function');
  });

  it('should return JSON response with correct headers', async () => {
    const { GET } = await import('../+server.js');

    const response = await GET();

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-cache, must-revalidate');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should use the twitch poller for stream state', async () => {
    const { GET } = await import('../+server.js');

    await GET();

    expect(mockGetActiveStreams).toHaveBeenCalled();
  });

  it('should return current stream state as JSON', async () => {
    mockGetActiveStreams.mockReturnValue(['nextlander', 'remap']);

    const { GET } = await import('../+server.js');
    const response = await GET();

    const data = await response.json();
    expect(data).toEqual(['nextlander', 'remap']);
  });

  it('should return empty array on error', async () => {
    mockGetActiveStreams.mockImplementation(() => {
      throw new Error('Simulated error');
    });

    const { GET } = await import('../+server.js');
    const response = await GET();

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('should handle empty stream list', async () => {
    mockGetActiveStreams.mockReturnValue([]);

    const { GET } = await import('../+server.js');
    const response = await GET();

    const data = await response.json();
    expect(data).toEqual([]);
    expect(response.status).toBe(200);
  });
});
