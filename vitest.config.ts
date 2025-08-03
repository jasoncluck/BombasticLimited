import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/lib/state/navigation-cache/__tests__/setup.ts'],
    globals: true,
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
