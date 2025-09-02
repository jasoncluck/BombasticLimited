import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import viteCompression from 'vite-plugin-compression';

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), enhancedImages(), viteCompression()],

  // Generate source maps in production for error tracking
  build: {
    sourcemap: isProduction ? 'hidden' : true,
    rollupOptions: {
      output: {
        // Ensure source maps are generated with proper naming
        sourcemapFileNames: 'assets/[name]-[hash].js.map',
      },
    },
  },

  // Disable HMR during testing to prevent dev server hangs
  server: isTest
    ? {
        hmr: false,
        watch: {
          // Ignore test files and other non-essential files to prevent restarts
          ignored: [
            '**/tests/**',
            '**/*.test.*',
            '**/*.spec.*',
            '**/node_modules/**',
            '**/.git/**',
          ],
        },
        // Prevent server from restarting on file changes during tests
        middlewareMode: false,
      }
    : {
        // Normal dev mode with full HMR capabilities
        hmr: {
          overlay: true,
        },
      },

  test: {
    setupFiles: [],
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: process.env.VITEST
    ? {
        conditions: ['browser'],
      }
    : undefined,
});
