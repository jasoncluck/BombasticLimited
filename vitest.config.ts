import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'jsdom',
    setupFiles: [
      './src/tests/setup-globals.ts',
      './src/lib/state/navigation-cache/__tests__/setup.ts',
    ],
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['tests/**/*', 'node_modules/**/*'],
    teardownTimeout: 30000,
  },
  resolve: {
    alias: {
      '$app/environment': path.resolve(
        __dirname,
        'src/lib/state/navigation-cache/__tests__/mocks/app-environment.ts'
      ),
      '$app/navigation': path.resolve(
        __dirname,
        'src/lib/state/navigation-cache/__tests__/mocks/app-navigation.ts'
      ),
      $lib: path.resolve(__dirname, 'src/lib'),
      '$service-worker': path.resolve(
        __dirname,
        'src/lib/state/navigation-cache/__tests__/mocks/service-worker.ts'
      ),
    },
  },
});
