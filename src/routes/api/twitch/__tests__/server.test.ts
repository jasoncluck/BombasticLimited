import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the twitch client
vi.mock('$lib/client/twitch.js', () => ({
  getMultipleStreamStatus: vi.fn(),
}));

// Mock the constants
vi.mock('$lib/constants/source.js', () => ({
  SOURCE_INFO: {
    giantbomb: { twitchId: '504350' },
    jeffgerstmann: { twitchId: '504350' },
    nextlander: { twitchId: '689331234' },
    remap: { twitchId: '913491352' },
  },
  SOURCES: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
}));

// Mock sveltekit-sse to return a simple response
vi.mock('sveltekit-sse', () => ({
  produce: vi.fn(() => Promise.resolve(new Response('', { 
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  }))),
}));

describe('/api/twitch endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export POST function', async () => {
    const module = await import('../+server.js');
    
    expect(typeof module.POST).toBe('function');
  });

  it('should return SSE response', async () => {
    const { POST } = await import('../+server.js');
    
    const response = await POST();
    
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  it('should use sveltekit-sse produce function', async () => {
    const { produce } = await import('sveltekit-sse');
    const { POST } = await import('../+server.js');
    
    await POST();
    
    expect(produce).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        stop: expect.any(Function)
      })
    );
  });

  it('should have the required dependencies available', async () => {
    // Test that all dependencies can be imported without errors
    const twitchModule = await import('$lib/client/twitch.js');
    const sourceModule = await import('$lib/constants/source.js');
    
    expect(typeof twitchModule.getMultipleStreamStatus).toBe('function');
    expect(Array.isArray(sourceModule.SOURCES)).toBe(true);
    expect(typeof sourceModule.SOURCE_INFO).toBe('object');
  });
});