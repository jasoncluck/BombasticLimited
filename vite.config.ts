import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), enhancedImages(), viteCompression()],
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
