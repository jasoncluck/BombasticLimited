import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock the environment variables
vi.mock('$env/static/private', () => ({
  TWITCH_CLIENT_ID: 'test_client_id',
  TWITCH_CLIENT_SECRET: 'test_client_secret',
}));

// Mock the Twurple modules
vi.mock('@twurple/auth', () => ({
  AppTokenAuthProvider: vi.fn(),
}));

vi.mock('@twurple/api', () => ({
  ApiClient: vi.fn(),
}));

// Mock the constants
vi.mock('$lib/constants/source.js', () => ({
  SOURCE_INFO: {
    giantbomb: { twitchId: '504350', displayName: 'Giant Bomb' },
    jeffgerstmann: { twitchId: '504350', displayName: 'Jeff Gerstmann' },
    nextlander: { twitchId: '689331234', displayName: 'Nextlander' },
    remap: { twitchId: '913491352', displayName: 'Remap' },
  },
  SOURCES: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
}));

// Mock the environment
vi.mock('$app/environment', () => ({
  dev: true,
}));

describe('twitch-webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set test environment variable
    process.env.TWITCH_WEBHOOK_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.TWITCH_WEBHOOK_SECRET;
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signatures', async () => {
      const { verifyWebhookSignature } = await import('../twitch-webhooks.js');
      
      const body = '{"test": "data"}';
      const messageId = 'test-message-id';
      const timestamp = '2023-01-01T00:00:00Z';
      const secret = 'test-secret';
      
      // Create expected signature
      const message = messageId + timestamp + body;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(message, 'utf8')
        .digest('hex');
      
      const signature = `sha256=${expectedSignature}`;
      
      const result = verifyWebhookSignature(body, signature, messageId, timestamp);
      expect(result).toBe(true);
    });

    it('should reject invalid webhook signatures', async () => {
      const { verifyWebhookSignature } = await import('../twitch-webhooks.js');
      
      const body = '{"test": "data"}';
      const messageId = 'test-message-id';
      const timestamp = '2023-01-01T00:00:00Z';
      const signature = 'sha256=invalid-signature';
      
      const result = verifyWebhookSignature(body, signature, messageId, timestamp);
      expect(result).toBe(false);
    });

    it('should reject signatures without sha256 prefix', async () => {
      const { verifyWebhookSignature } = await import('../twitch-webhooks.js');
      
      const body = '{"test": "data"}';
      const messageId = 'test-message-id';
      const timestamp = '2023-01-01T00:00:00Z';
      const signature = 'invalid-format';
      
      const result = verifyWebhookSignature(body, signature, messageId, timestamp);
      expect(result).toBe(false);
    });
  });

  describe('subscribeToStreamUpdates', () => {
    it('should allow subscribing to stream updates', async () => {
      const { subscribeToStreamUpdates } = await import('../twitch-webhooks.js');
      
      const callback = vi.fn();
      const unsubscribe = subscribeToStreamUpdates(callback);
      
      // Should call callback immediately with current state (empty initially)
      expect(callback).toHaveBeenCalledWith([]);
      expect(typeof unsubscribe).toBe('function');
      
      // Clean up
      unsubscribe();
    });

    it('should return current live streams', async () => {
      const { getCurrentLiveStreams } = await import('../twitch-webhooks.js');
      
      const streams = getCurrentLiveStreams();
      expect(Array.isArray(streams)).toBe(true);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should handle webhook challenge', async () => {
      const { handleWebhookEvent } = await import('../twitch-webhooks.js');
      
      const body = JSON.stringify({
        challenge: 'test-challenge',
        subscription: {
          type: 'stream.online',
        },
      });
      
      const signature = createTestSignature(body, 'test-message-id', '2023-01-01T00:00:00Z');
      
      const request = new Request('http://localhost:5173/api/twitch/webhook', {
        method: 'POST',
        headers: {
          'twitch-eventsub-message-signature': signature,
          'twitch-eventsub-message-id': 'test-message-id',
          'twitch-eventsub-message-timestamp': '2023-01-01T00:00:00Z',
          'twitch-eventsub-message-type': 'webhook_callback_verification',
        },
        body,
      });
      
      const response = await handleWebhookEvent(request);
      expect(response.status).toBe(200);
      
      const responseText = await response.text();
      expect(responseText).toBe('test-challenge');
    });

    it('should handle stream online notifications', async () => {
      const { handleWebhookEvent } = await import('../twitch-webhooks.js');
      
      const body = JSON.stringify({
        subscription: {
          type: 'stream.online',
        },
        event: {
          broadcaster_user_id: '689331234', // nextlander
          broadcaster_user_name: 'Nextlander',
        },
      });
      
      const signature = createTestSignature(body, 'test-message-id', '2023-01-01T00:00:00Z');
      
      const request = new Request('http://localhost:5173/api/twitch/webhook', {
        method: 'POST',
        headers: {
          'twitch-eventsub-message-signature': signature,
          'twitch-eventsub-message-id': 'test-message-id',
          'twitch-eventsub-message-timestamp': '2023-01-01T00:00:00Z',
          'twitch-eventsub-message-type': 'notification',
        },
        body,
      });
      
      const response = await handleWebhookEvent(request);
      expect(response.status).toBe(200);
    });

    it('should reject requests with invalid signatures', async () => {
      const { handleWebhookEvent } = await import('../twitch-webhooks.js');
      
      const body = JSON.stringify({ test: 'data' });
      
      const request = new Request('http://localhost:5173/api/twitch/webhook', {
        method: 'POST',
        headers: {
          'twitch-eventsub-message-signature': 'sha256=invalid-signature',
          'twitch-eventsub-message-id': 'test-message-id',
          'twitch-eventsub-message-timestamp': '2023-01-01T00:00:00Z',
          'twitch-eventsub-message-type': 'notification',
        },
        body,
      });
      
      const response = await handleWebhookEvent(request);
      expect(response.status).toBe(401);
    });

    it('should reject requests with missing headers', async () => {
      const { handleWebhookEvent } = await import('../twitch-webhooks.js');
      
      const body = JSON.stringify({ test: 'data' });
      
      const request = new Request('http://localhost:5173/api/twitch/webhook', {
        method: 'POST',
        headers: {
          // Missing required headers
        },
        body,
      });
      
      const response = await handleWebhookEvent(request);
      expect(response.status).toBe(400);
    });
  });
});

// Helper function to create test signatures
function createTestSignature(body: string, messageId: string, timestamp: string): string {
  const secret = 'test-secret';
  const message = messageId + timestamp + body;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');
  return `sha256=${signature}`;
}