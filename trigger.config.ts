import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project: 'proj_oawwnoegrfizlorfxuan',
  runtime: 'node',
  logLevel: 'error', // Reduced from 'log' to minimize logging costs
  // Reduced max duration from 3600 to 300 seconds (5 minutes)
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2, // Reduced from 3
    },
  },
  dirs: ['./src/trigger'],
  build: {
    external: ['sharp'],
  },
});
