#!/usr/bin/env node

/**
 * Setup script for Twitch EventSub webhooks
 * Usage: node scripts/setup-twitch-webhooks.js [command]
 * Commands: setup, list, cleanup
 */

import { runWebhookCommand } from '../src/lib/server/setup-webhooks.js';

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