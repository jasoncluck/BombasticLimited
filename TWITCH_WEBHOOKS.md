# Twitch EventSub Webhooks Implementation

This document describes the implementation of Twitch EventSub webhooks to replace the expensive polling mechanism for stream monitoring.

## Overview

The webhook system provides real-time notifications when Twitch streams go online or offline, eliminating the need for continuous API polling and significantly reducing Vercel compute costs.

## Architecture

### Core Components

1. **Webhook Endpoint** (`src/routes/(app)/api/twitch/webhook/+server.ts`)
   - Handles incoming webhook events from Twitch EventSub
   - Verifies webhook signatures for security
   - Processes stream online/offline notifications

2. **Webhook State Management** (`src/lib/server/twitch-webhooks.ts`)
   - Maintains live stream state based on webhook notifications
   - Provides subscription mechanism for real-time updates
   - Handles signature verification and event processing

3. **Webhook Setup Script** (`src/lib/server/setup-webhooks.ts`)
   - Registers webhook subscriptions with Twitch EventSub
   - Manages subscription lifecycle (create, list, cleanup)
   - CLI-friendly for deployment automation

4. **Enhanced SSE Endpoint** (`src/routes/(app)/api/twitch/+server.ts`)
   - Modified to use webhook state as primary source
   - Maintains backup polling at reduced frequency (10-minute intervals)
   - Ensures backward compatibility with existing clients

## Environment Variables

Add these environment variables to your `.env` file:

```env
# Required: Twitch API credentials (already exists)
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret

# Required: Webhook secret for signature verification
TWITCH_WEBHOOK_SECRET=your_secure_random_secret

# Optional: Used for webhook URL generation (auto-detected in Vercel)
VERCEL_URL=your-domain.vercel.app
```

## Webhook URL Configuration

The system uses **Vercel rewrites** for optimal webhook handling as recommended by Twurple documentation:

- **Development**: `https://localhost:5173/api/twitch/webhook` (direct endpoint)
- **Production**: `https://your-domain.com/webhooks/twitch` (via Vercel rewrite to `/api/twitch/webhook`)

### Benefits of Vercel Rewrites

1. **Clean URLs**: `/webhooks/twitch` is more semantic than `/api/twitch/webhook`
2. **Load Balancing**: Vercel handles traffic distribution across regions
3. **SSL Termination**: Automatic HTTPS handling
4. **Route Optimization**: Better performance for webhook endpoints
5. **URL Stability**: Consistent webhook URLs regardless of internal routing changes

The rewrite is configured in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/webhooks/twitch",
      "destination": "/api/twitch/webhook"
    }
  ]
}
```

## Setup Instructions

### 1. Configure Environment Variables

Ensure all required environment variables are set in your deployment environment.

### 2. Set Up Webhook Subscriptions

Run the setup script to register webhooks with Twitch EventSub:

```bash
# Set up all webhook subscriptions
npm run twitch:webhook:setup

# List existing subscriptions
npm run twitch:webhook:list

# Clean up all subscriptions (if needed)
npm run twitch:webhook:cleanup
```

**Note**: The setup script will automatically use the correct webhook URL:
- Development: `http://localhost:5173/api/twitch/webhook`
- Production: `https://your-domain.com/webhooks/twitch` (via Vercel rewrite)

### 3. Deploy

Deploy your application with the webhook endpoint available at:
- **Direct endpoint**: `/api/twitch/webhook` 
- **Public webhook URL**: `/webhooks/twitch` (recommended for Twitch EventSub registration)

## Cost Optimization Benefits

### Before (Polling)
- **Polling Frequency**: Every 60 seconds
- **Concurrent Connections**: Each SSE client = separate polling instance
- **API Calls**: ~1,440 calls/day per source (4 sources = 5,760 calls/day)
- **Function Duration**: 5 minutes per SSE connection
- **Estimated Cost**: $5-15/month on Vercel

### After (Webhooks)
- **Real-time Updates**: Only when streams change status
- **Shared State**: All SSE clients use same webhook-driven state
- **API Calls**: Only for webhook registration/management
- **Function Duration**: Milliseconds per webhook event
- **Backup Polling**: Every 10 minutes (96 calls/day per source)
- **Estimated Cost**: $0.50-2/month on Vercel

## Security

- **Signature Verification**: All webhook events are verified using HMAC-SHA256
- **Message Validation**: Proper header and payload validation
- **Error Handling**: Graceful handling of malformed requests

## Monitoring

The system provides comprehensive logging:

- Webhook event processing
- Stream status changes
- Subscription management
- Error conditions

## Fallback Mechanism

If webhooks fail, the system maintains:

- Backup polling every 10 minutes
- Graceful degradation to polling-only mode
- Automatic recovery when webhooks resume

## Testing

Run the webhook tests:

```bash
# Test webhook utilities
npm run test src/lib/server/__tests__/twitch-webhooks.test.ts

# Test webhook endpoint
npm run test "src/routes/(app)/api/twitch/webhook/__tests__/server.test.ts"

# Test enhanced SSE endpoint
npm run test "src/routes/(app)/api/twitch/__tests__/server.test.ts"
```

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Webhook subscriptions created (`npm run twitch:webhook:setup`)
- [ ] Webhook endpoint accessible at `/webhooks/twitch` (via Vercel rewrite)
- [ ] Test webhook functionality
- [ ] Monitor logs for webhook events
- [ ] Verify cost reduction in Vercel dashboard

## Troubleshooting

### Webhook Events Not Received

1. Check webhook subscriptions: `npm run twitch:webhook:list`
2. Verify environment variables are set correctly
3. Ensure webhook endpoint is publicly accessible
4. Check Twitch EventSub dashboard for subscription status

### Signature Verification Failures

1. Verify `TWITCH_WEBHOOK_SECRET` matches the value used during subscription setup
2. Check that webhook URL is correct (HTTPS required for production)
3. Ensure message headers are properly forwarded by your hosting provider

### High API Usage

1. Confirm webhooks are working (should see real-time logs)
2. Check backup polling frequency (should be 10-minute intervals)
3. Verify multiple SSE connections aren't creating duplicate polling