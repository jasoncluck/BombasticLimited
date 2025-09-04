import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import viteCompression from 'vite-plugin-compression';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [
    sveltekit(),
    tailwindcss(),
    enhancedImages(),
    ...(isProduction ? [viteCompression()] : []),
  ],

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

  // Configure server based on environment
  server: {
    hmr: isTest
      ? false
      : {
          overlay: true,
        },
    watch: {
      // Always ignore these directories to prevent file descriptor issues
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/tests/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/coverage/**',
        '**/.svelte-kit/**',
        '**/build/**',
        '**/dist/**',
        '**/.vercel/**',
        '**/playwright-report/**',
        '**/test-results/**',
      ],
    },
    // Remove middlewareMode as it's not needed
  },

  // Test configuration
  test: {
    environment: 'jsdom',
    setupFiles: [],
    globals: true,
    env: {
      NODE_ENV: 'test',
    },
  },

  // Resolve configuration for testing
  resolve: process.env.VITEST
    ? {
        conditions: ['browser'],
      }
    : undefined,
});
