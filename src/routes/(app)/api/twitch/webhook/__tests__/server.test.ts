import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the webhook handler
const mockHandleWebhookEvent = vi.fn();

vi.mock('$lib/server/twitch-webhooks.js', () => ({
  handleWebhookEvent: mockHandleWebhookEvent,
}));

describe('/api/twitch/webhook endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export GET and POST functions', async () => {
    const module = await import('../+server.js');

    expect(typeof module.GET).toBe('function');
    expect(typeof module.POST).toBe('function');
  });

  it('should handle GET requests (webhook verification)', async () => {
    const mockResponse = new Response('test-challenge', { status: 200 });
    mockHandleWebhookEvent.mockResolvedValue(mockResponse);

    const { GET } = await import('../+server.js');
    
    const mockRequest = new Request('http://localhost:5173/api/twitch/webhook?hub.challenge=test');
    const mockEvent = { request: mockRequest };

    const response = await GET(mockEvent);

    expect(mockHandleWebhookEvent).toHaveBeenCalledWith(mockRequest);
    expect(response).toBe(mockResponse);
  });

  it('should handle POST requests (webhook events)', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    mockHandleWebhookEvent.mockResolvedValue(mockResponse);

    const { POST } = await import('../+server.js');
    
    const mockRequest = new Request('http://localhost:5173/api/twitch/webhook', {
      method: 'POST',
      body: JSON.stringify({ test: 'event' }),
    });
    const mockEvent = { request: mockRequest };

    const response = await POST(mockEvent);

    expect(mockHandleWebhookEvent).toHaveBeenCalledWith(mockRequest);
    expect(response).toBe(mockResponse);
  });

  it('should handle webhook handler errors', async () => {
    const mockError = new Error('Test error');
    mockHandleWebhookEvent.mockRejectedValue(mockError);

    const { POST } = await import('../+server.js');
    
    const mockRequest = new Request('http://localhost:5173/api/twitch/webhook', {
      method: 'POST',
      body: JSON.stringify({ test: 'event' }),
    });
    const mockEvent = { request: mockRequest };

    // Should not throw, error should be handled by the webhook handler
    await expect(POST(mockEvent)).rejects.toThrow('Test error');
  });
});