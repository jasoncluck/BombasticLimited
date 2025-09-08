import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/lib/tests/setup-globals.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['tests/**/*', 'node_modules/**/*'],
    teardownTimeout: 30000,
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
      '$app/stores': path.resolve(__dirname, 'src/lib/tests/__mocks__/app-stores.js'),
      '$app/navigation': path.resolve(__dirname, 'src/lib/tests/__mocks__/app-navigation.js'),
    },
  },
});
