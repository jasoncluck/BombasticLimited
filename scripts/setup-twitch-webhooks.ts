#!/usr/bin/env tsx

/**
 * Setup script for Twitch EventSub webhooks
 * Usage: tsx scripts/setup-twitch-webhooks.ts [command]
 * Commands: setup, list, cleanup
 */

import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load source constants
const SOURCE_INFO = {
  giantbomb: { twitchId: '504350', displayName: 'Giant Bomb' },
  jeffgerstmann: { twitchId: '13831039', displayName: 'Jeff Gerstmann' },
  nextlander: { twitchId: '689331234', displayName: 'Nextlander' },
  remap: { twitchId: '913491352', displayName: 'Remap' },
} as const;

const SOURCES = ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'] as const;
type Source = (typeof SOURCES)[number];

// Environment configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET;

const isDev = process.env.NODE_ENV === 'development';
const WEBHOOK_BASE_URL = isDev
  ? 'https://localhost:5173'
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://bombastic.ltd';

// Use Vercel rewrite path for production webhook URL
const WEBHOOK_CALLBACK_URL = isDev
  ? `${WEBHOOK_BASE_URL}/api/twitch/webhook`
  : `${WEBHOOK_BASE_URL}/webhooks/twitch`;

/**
 * Setup webhook subscriptions with Twitch EventSub
 */
async function setupTwitchWebhooks(): Promise<void> {
  // Validate environment variables
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error(
      'TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables are required'
    );
  }

  if (
    TWITCH_CLIENT_ID === 'placeholder_client_id' ||
    TWITCH_CLIENT_SECRET === 'placeholder_client_secret'
  ) {
    throw new Error('Twitch credentials not configured');
  }

  // Initialize Twitch API client
  const authProvider = new AppTokenAuthProvider(
    TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET
  );
  const apiClient = new ApiClient({ authProvider });

  console.log('🎣 Setting up Twitch EventSub webhook subscriptions...');
  console.log(`📍 Webhook callback URL: ${WEBHOOK_CALLBACK_URL}`);

  if (TWITCH_WEBHOOK_SECRET) {
    console.log(
      `🔒 Using webhook secret for signature verification: ${TWITCH_WEBHOOK_SECRET.substring(0, 8)}...`
    );
  } else {
    console.log(
      '⚠️  No webhook secret configured - webhooks will not be signature verified'
    );
  }

  const results = [];

  for (const source of SOURCES) {
    const twitchId = SOURCE_INFO[source].twitchId;
    const displayName = SOURCE_INFO[source].displayName;

    try {
      console.log(
        `\n🔧 Setting up webhooks for ${displayName} (${twitchId})...`
      );

      // Create stream.online subscription
      const onlineSubscription = await apiClient.eventSub.createSubscription(
        'stream.online',
        '1',
        { broadcaster_user_id: twitchId },
        {
          method: 'webhook',
          callback: WEBHOOK_CALLBACK_URL,
          ...(TWITCH_WEBHOOK_SECRET && { secret: TWITCH_WEBHOOK_SECRET }),
        }
      );

      console.log(
        `✅ Created stream.online subscription for ${displayName}: ${onlineSubscription.id}`
      );

      // Create stream.offline subscription
      const offlineSubscription = await apiClient.eventSub.createSubscription(
        'stream.offline',
        '1',
        { broadcaster_user_id: twitchId },
        {
          method: 'webhook',
          callback: WEBHOOK_CALLBACK_URL,
          ...(TWITCH_WEBHOOK_SECRET && { secret: TWITCH_WEBHOOK_SECRET }),
        }
      );

      console.log(
        `✅ Created stream.offline subscription for ${displayName}: ${offlineSubscription.id}`
      );

      results.push({
        source,
        twitchId,
        displayName,
        onlineSubscriptionId: onlineSubscription.id,
        offlineSubscriptionId: offlineSubscription.id,
        status: 'success',
      });
    } catch (error) {
      console.error(`❌ Failed to setup webhooks for ${displayName}:`, error);
      results.push({
        source,
        twitchId,
        displayName,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Summary
  console.log('\n📊 Webhook Setup Summary:');
  const successful = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Failed setups:');
    results
      .filter((r) => r.status === 'error')
      .forEach((r) => console.log(`   - ${r.displayName}: ${r.error}`));
  }

  if (successful > 0) {
    console.log('\n✅ Successful setups:');
    results
      .filter((r) => r.status === 'success')
      .forEach((r) =>
        console.log(
          `   - ${r.displayName}: Online(${r.onlineSubscriptionId}) + Offline(${r.offlineSubscriptionId})`
        )
      );
  }

  console.log('\n🎯 Webhook setup complete!');
}

/**
 * List existing EventSub subscriptions
 */
async function listWebhookSubscriptions(): Promise<void> {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error(
      'TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables are required'
    );
  }

  const authProvider = new AppTokenAuthProvider(
    TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET
  );
  const apiClient = new ApiClient({ authProvider });

  try {
    console.log('📋 Listing existing EventSub subscriptions...');

    const subscriptionsResult = await apiClient.eventSub.getSubscriptions();
    const subscriptions = subscriptionsResult.data;

    if (subscriptions.length === 0) {
      console.log('📭 No existing subscriptions found');
      return;
    }

    console.log(`📊 Found ${subscriptions.length} subscriptions:\n`);

    subscriptions.forEach((sub, index) => {
      console.log(`${index + 1}. ${sub.type}`);
      console.log(`   ID: ${sub.id}`);
      console.log(`   Status: ${sub.status}`);
      console.log(`   Created: ${sub.creationDate}`);
      if (sub.condition && 'broadcaster_user_id' in sub.condition) {
        const source = SOURCES.find(
          (s) => SOURCE_INFO[s].twitchId === sub.condition.broadcaster_user_id
        );
        console.log(
          `   Source: ${source ? SOURCE_INFO[source].displayName : 'Unknown'} (${sub.condition.broadcaster_user_id})`
        );
      }
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to list subscriptions:', error);
  }
}

/**
 * Clean up all existing EventSub subscriptions
 */
async function cleanupWebhookSubscriptions(): Promise<void> {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error(
      'TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables are required'
    );
  }

  const authProvider = new AppTokenAuthProvider(
    TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET
  );
  const apiClient = new ApiClient({ authProvider });

  try {
    console.log('🧹 Cleaning up existing EventSub subscriptions...');

    const subscriptionsResult = await apiClient.eventSub.getSubscriptions();
    const subscriptions = subscriptionsResult.data;

    if (subscriptions.length === 0) {
      console.log('📭 No subscriptions to clean up');
      return;
    }

    console.log(`🗑️  Deleting ${subscriptions.length} subscriptions...`);

    for (const sub of subscriptions) {
      try {
        await apiClient.eventSub.deleteSubscription(sub.id);
        console.log(`✅ Deleted subscription: ${sub.id} (${sub.type})`);
      } catch (error) {
        console.error(`❌ Failed to delete subscription ${sub.id}:`, error);
      }
    }

    console.log('🧹 Cleanup complete!');
  } catch (error) {
    console.error('❌ Failed to cleanup subscriptions:', error);
  }
}

/**
 * CLI utility function for running setup commands
 */
async function runWebhookCommand(command: string): Promise<void> {
  switch (command) {
    case 'setup':
      await setupTwitchWebhooks();
      break;
    case 'list':
      await listWebhookSubscriptions();
      break;
    case 'cleanup':
      await cleanupWebhookSubscriptions();
      break;
    default:
      console.log('Available commands: setup, list, cleanup');
      break;
  }
}

// Main execution
const command = process.argv[2] || 'setup';

console.log(`🎯 Running webhook command: ${command}`);
console.log('');

runWebhookCommand(command)
  .then(() => {
    console.log('✅ Command completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Command failed:', error);
    process.exit(1);
  });
