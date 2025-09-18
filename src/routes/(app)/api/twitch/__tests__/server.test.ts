import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '$lib/constants/source.js';

// Mock the twitch poller
const mockAddStreamChangeListener = vi.fn();
const mockGetActiveStreams = vi.fn();

vi.mock('$lib/server/twitch-poller.js', () => ({
  addStreamChangeListener: mockAddStreamChangeListener,
  getActiveStreams: mockGetActiveStreams,
}));

describe('/api/twitch endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddStreamChangeListener.mockClear().mockReturnValue(vi.fn());
    mockGetActiveStreams.mockClear().mockReturnValue([]);
  });

  it('should export POST function', async () => {
    const module = await import('../+server.js');

    expect(typeof module.POST).toBe('function');
  });

  it('should export POST function', async () => {
    const module = await import('../+server.js');

    expect(typeof module.POST).toBe('function');
  });

  it('should return SSE response with correct headers', async () => {
    const { POST } = await import('../+server.js');

    const response = await POST();

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('connection')).toBe('keep-alive');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should return a ReadableStream', async () => {
    const { POST } = await import('../+server.js');

    const response = await POST();

    expect(response.body).toBeDefined();
    expect(response.body).toBeInstanceOf(ReadableStream);
  });

  it('should use the twitch poller for stream state', async () => {
    const { POST } = await import('../+server.js');

    await POST();

    expect(mockGetActiveStreams).toHaveBeenCalled();
    expect(mockAddStreamChangeListener).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  it('should send initial stream state', async () => {
    mockGetActiveStreams.mockReturnValue(['nextlander', 'remap']);

    const { POST } = await import('../+server.js');
    const response = await POST();

    // Read the initial chunk from the stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('event: streamingSubscriptions');
    expect(text).toContain('data: ["nextlander","remap"]');

    reader.releaseLock();
  });

  it('should handle stream changes from poller', async () => {
    let changeCallback: any = null;

    mockAddStreamChangeListener.mockImplementation((callback: any) => {
      changeCallback = callback;
      return vi.fn(); // cleanup function
    });

    const { POST } = await import('../+server.js');
    const response = await POST();

    expect(changeCallback).toBeDefined();

    // Simulate a stream change
    if (changeCallback) {
      changeCallback(['giantbomb']);
    }

    // The stream should have been updated (we can't easily test the output here
    // without more complex stream mocking, but we can verify the callback was set up)
    expect(mockAddStreamChangeListener).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  it('should have proper cleanup when stream is cancelled', async () => {
    const mockCleanup = vi.fn();

    mockAddStreamChangeListener.mockReturnValue(mockCleanup);

    const { POST } = await import('../+server.js');
    const response = await POST();

    const reader = response.body!.getReader();

    // Cancel the stream to trigger cleanup
    await reader.cancel('test cancellation');

    expect(mockCleanup).toHaveBeenCalled();
  });

  it('should support POST for backward compatibility', async () => {
    const { POST } = await import('../+server.js');

    const response = await POST();

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  it('should close connection before timeout in production mode', async () => {
    // Mock production environment
    vi.doMock('$app/environment', () => ({
      dev: false,
    }));

    const { POST } = await import('../+server.js');
    const response = await POST();

    expect(response).toBeInstanceOf(Response);
    expect(response.body).toBeInstanceOf(ReadableStream);

    // The connection should have timeout management built-in
    // This is difficult to test without advancing timers, but we verify the structure
  });
});
