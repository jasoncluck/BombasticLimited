import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup-globals.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['tests/**/*', 'node_modules/**/*'],
    teardownTimeout: 30000,
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
    },
  },
});
