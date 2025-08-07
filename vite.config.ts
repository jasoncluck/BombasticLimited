import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import viteCompression from 'vite-plugin-compression';

const isTest = process.env.NODE_ENV === 'test';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), enhancedImages(), viteCompression()],

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
  define: {
    // Ensure compatibility with SvelteKit
    __SVELTEKIT_DEV__: false,
    // Inject environment variables into the service worker
    __SUPABASE_URL__: JSON.stringify(process.env.PUBLIC_SUPABASE_URL),
    // Make Svelte think we're in a browser environment
    'import.meta.env.SSR': false,
  },
  // Tell Vitest to use the `browser` entry points in `package.json` files, even though it's running in Node
  resolve: process.env.VITEST
    ? {
        conditions: ['browser'],
      }
    : undefined,
});
