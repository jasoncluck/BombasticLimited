import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '$lib/constants/source';

// Mock the twitch poller
const mockGetActiveStreams = vi.fn();
const mockGetPollerStatus = vi.fn();
const mockGetActiveStreamsWithFreshData = vi.fn();

vi.mock('$lib/server/twitch-poller', () => ({
  getActiveStreams: mockGetActiveStreams,
  getPollerStatus: mockGetPollerStatus,
  getActiveStreamsWithFreshData: mockGetActiveStreamsWithFreshData,
}));

// Helper to create minimal mock request event
function createMockRequestEvent(headers: Record<string, string> = {}) {
  const mockHeaders = new Map();
  Object.entries(headers).forEach(([key, value]) => {
    mockHeaders.set(key.toLowerCase(), value);
  });

  const mockRequest = {
    headers: {
      get: (name: string) => mockHeaders.get(name.toLowerCase()) || null,
    },
  };

  let responseHeaders: Record<string, string> = {};
  const mockSetHeaders = (headers: Record<string, string>) => {
    responseHeaders = { ...responseHeaders, ...headers };
  };

  return {
    request: mockRequest,
    setHeaders: mockSetHeaders,
    getResponseHeaders: () => responseHeaders,
    // Add minimal required properties to satisfy TypeScript
    cookies: {} as any,
    fetch: global.fetch,
    getClientAddress: () => '127.0.0.1',
    locals: {},
    params: {},
    route: { id: '/(app)/api/twitch' },
    url: new URL('http://localhost:3000/api/twitch'),
    isDataRequest: false,
    isSubRequest: false,
    platform: undefined,
  };
}

describe('/api/twitch endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset module cache to avoid state leaking
    mockGetActiveStreams.mockClear().mockReturnValue([]);
    mockGetPollerStatus.mockClear().mockReturnValue({
      isPolling: false,
      activeStreamsCount: 0,
      activeStreams: [],
      listenersCount: 0,
      lastPollTime: null,
      isStale: true,
    });
    mockGetActiveStreamsWithFreshData.mockClear().mockResolvedValue([]);
  });

  it('should export GET function', async () => {
    const module = await import('../+server');

    expect(typeof module.GET).toBe('function');
  });

  it('should return JSON response with correct headers', async () => {
    const { GET } = await import('../+server');
    const mockEvent = createMockRequestEvent();

    const response = await GET(mockEvent as any);

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(mockEvent.getResponseHeaders()['Access-Control-Allow-Origin']).toBe(
      '*'
    );
  });

  it('should use the twitch poller for stream state', async () => {
    const { GET } = await import('../+server');
    const mockEvent = createMockRequestEvent();

    await GET(mockEvent as any);

    expect(mockGetActiveStreamsWithFreshData).toHaveBeenCalled();
  });

  it('should return current stream state as JSON', async () => {
    mockGetActiveStreamsWithFreshData.mockResolvedValue([
      'nextlander',
      'remap',
    ]);

    const { GET } = await import('../+server');
    const mockEvent = createMockRequestEvent();
    const response = await GET(mockEvent as any);

    const data = await response.json();
    expect(data).toEqual(['nextlander', 'remap']);
  });

  it('should return cached data on error', async () => {
    // First set up some successful data to cache
    mockGetActiveStreamsWithFreshData.mockResolvedValueOnce(['cached-stream']);

    const { GET } = await import('../+server');
    const mockEvent1 = createMockRequestEvent();
    await GET(mockEvent1 as any); // This should cache the data

    // Now make it fail and expect cached data
    mockGetActiveStreamsWithFreshData.mockRejectedValue(
      new Error('Simulated error')
    );

    const mockEvent2 = createMockRequestEvent();
    const response = await GET(mockEvent2 as any);

    expect(response.status).toBe(200); // Should return cached data, not error
    const data = await response.json();
    expect(data).toEqual(['cached-stream']); // Should return cached data
  });

  it('should handle empty stream list', async () => {
    mockGetActiveStreamsWithFreshData.mockResolvedValue([]);

    const { GET } = await import('../+server');
    const mockEvent = createMockRequestEvent();
    const response = await GET(mockEvent as any);

    const data = await response.json();
    expect(data).toEqual([]);
    expect(response.status).toBe(200);
  });

  it('should handle ETag caching', async () => {
    mockGetActiveStreamsWithFreshData.mockResolvedValue(['nextlander']);
    mockGetPollerStatus.mockReturnValue({
      isPolling: false,
      activeStreamsCount: 1,
      activeStreams: ['nextlander'],
      listenersCount: 0,
      lastPollTime: new Date().toISOString(),
      isStale: false, // Data is fresh
    });

    const { GET } = await import('../+server');

    // First request - should get data and ETag
    const mockEvent1 = createMockRequestEvent();
    const response1 = await GET(mockEvent1 as any);

    expect(response1.status).toBe(200);
    const etag = mockEvent1.getResponseHeaders()['ETag'];
    expect(etag).toBeTruthy();

    // Second request with matching ETag - should get 304
    const mockEvent2 = createMockRequestEvent({ 'if-none-match': etag });
    const response2 = await GET(mockEvent2 as any);

    expect(response2.status).toBe(304);
  });

  it('should implement stale-while-revalidate caching', async () => {
    mockGetActiveStreamsWithFreshData.mockResolvedValue(['nextlander']);
    mockGetPollerStatus.mockReturnValue({
      isPolling: false,
      activeStreamsCount: 1,
      activeStreams: ['nextlander'],
      listenersCount: 0,
      lastPollTime: new Date(Date.now() - 60000).toISOString(), // 1 minute ago (stale)
      isStale: true,
    });

    const { GET } = await import('../+server');
    const mockEvent = createMockRequestEvent();
    const response = await GET(mockEvent as any);

    expect(response.status).toBe(200);
    expect(mockEvent.getResponseHeaders()['Cache-Control']).toContain(
      'stale-while-revalidate'
    );
  });
});
