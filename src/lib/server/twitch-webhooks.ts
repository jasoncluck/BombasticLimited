import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } from '$env/static/private';
import { SOURCE_INFO, SOURCES } from '$lib/constants/source.js';
import { dev } from '$app/environment';
import type { Source } from '$lib/constants/source.js';
import crypto from 'crypto';

// Environment variables for webhook configuration
const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || 'default-dev-secret';

// Initialize Twitch API client for webhook management
let authProvider: AppTokenAuthProvider | undefined;
let apiClient: ApiClient | undefined;

const shouldInitialize =
  TWITCH_CLIENT_ID !== 'placeholder_client_id' &&
  TWITCH_CLIENT_SECRET !== 'placeholder_client_secret' &&
  typeof window === 'undefined' && // Server-side only
  process.env.NODE_ENV !== 'test';

if (shouldInitialize) {
  authProvider = new AppTokenAuthProvider(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);
  apiClient = new ApiClient({ authProvider });
}

// Global state for live streams - this replaces the polling mechanism
const liveStreams = new Set<Source>();
const subscribers = new Set<(streams: Source[]) => void>();

/**
 * Subscribe to live stream updates
 */
export function subscribeToStreamUpdates(callback: (streams: Source[]) => void): () => void {
  subscribers.add(callback);
  
  // Immediately send current state
  callback(Array.from(liveStreams));
  
  // Return unsubscribe function
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Get current live streams
 */
export function getCurrentLiveStreams(): Source[] {
  return Array.from(liveStreams);
}

/**
 * Update stream status and notify subscribers
 */
function updateStreamStatus(source: Source, isLive: boolean): void {
  const wasLive = liveStreams.has(source);
  
  if (isLive && !wasLive) {
    liveStreams.add(source);
    console.log(`🔴 Webhook: ${source} started streaming`);
  } else if (!isLive && wasLive) {
    liveStreams.delete(source);
    console.log(`⚫ Webhook: ${source} ended streaming`);
  }
  
  // Notify all subscribers if there was a change
  if (wasLive !== isLive) {
    const currentStreams = Array.from(liveStreams);
    subscribers.forEach(callback => {
      try {
        callback(currentStreams);
      } catch (error) {
        console.error('Error notifying stream subscriber:', error);
      }
    });
  }
}

/**
 * Find source by Twitch user ID
 */
function findSourceByTwitchId(twitchId: string): Source | undefined {
  return SOURCES.find(source => SOURCE_INFO[source].twitchId === twitchId);
}

/**
 * Verify webhook signature using HMAC-SHA256
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  messageId: string,
  timestamp: string
): boolean {
  try {
    // Twitch EventSub signature format: sha256=<signature>
    if (!signature.startsWith('sha256=')) {
      return false;
    }
    
    const actualSignature = signature.slice(7); // Remove 'sha256=' prefix
    
    // Validate signature is hex and has correct length
    if (!/^[a-f0-9]{64}$/i.test(actualSignature)) {
      return false;
    }
    
    // Create the message to sign (as per Twitch EventSub specification)
    const message = messageId + timestamp + body;
    
    // Create HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', TWITCH_WEBHOOK_SECRET)
      .update(message, 'utf8')
      .digest('hex');
    
    // Compare signatures securely (both should be 64-character hex strings)
    return crypto.timingSafeEqual(
      Buffer.from(actualSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Handle webhook challenge (for subscription verification)
 */
function handleWebhookChallenge(body: any): Response | null {
  if (body.challenge) {
    console.log('🤝 Responding to webhook challenge');
    return new Response(body.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  return null;
}

/**
 * Process stream online/offline events
 */
function processStreamEvent(event: any): void {
  const eventType = event.subscription?.type;
  const broadcasterUserId = event.event?.broadcaster_user_id;
  
  if (!broadcasterUserId) {
    console.warn('No broadcaster_user_id in event');
    return;
  }
  
  const source = findSourceByTwitchId(broadcasterUserId);
  if (!source) {
    console.warn(`Unknown broadcaster_user_id: ${broadcasterUserId}`);
    return;
  }
  
  switch (eventType) {
    case 'stream.online':
      console.log(`🔴 EventSub: ${source} went live`);
      updateStreamStatus(source, true);
      break;
    case 'stream.offline':
      console.log(`⚫ EventSub: ${source} went offline`);
      updateStreamStatus(source, false);
      break;
    default:
      console.log(`Unknown event type: ${eventType}`);
  }
}

/**
 * Handle webhook event (called by the webhook endpoint)
 */
export async function handleWebhookEvent(request: Request): Promise<Response> {
  try {
    // Get headers
    const signature = request.headers.get('twitch-eventsub-message-signature');
    const messageId = request.headers.get('twitch-eventsub-message-id');
    const timestamp = request.headers.get('twitch-eventsub-message-timestamp');
    const messageType = request.headers.get('twitch-eventsub-message-type');
    
    // Get body
    const body = await request.text();
    
    // Verify signature
    if (!signature || !messageId || !timestamp) {
      console.warn('Missing required headers');
      return new Response('Bad Request', { status: 400 });
    }
    
    if (!verifyWebhookSignature(body, signature, messageId, timestamp)) {
      console.warn('Invalid webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Parse JSON
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON body:', error);
      return new Response('Bad Request', { status: 400 });
    }
    
    // Handle webhook challenge (for subscription verification)
    const challengeResponse = handleWebhookChallenge(parsedBody);
    if (challengeResponse) {
      return challengeResponse;
    }
    
    // Handle different message types
    switch (messageType) {
      case 'webhook_callback_verification':
        // Already handled by challenge response above
        return new Response('OK', { status: 200 });
        
      case 'notification':
        processStreamEvent(parsedBody);
        return new Response('OK', { status: 200 });
        
      case 'revocation':
        console.warn('Webhook subscription revoked:', parsedBody);
        return new Response('OK', { status: 200 });
        
      default:
        console.warn(`Unknown message type: ${messageType}`);
        return new Response('OK', { status: 200 });
    }
    
  } catch (error) {
    console.error('Error handling webhook event:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}