import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    // Add these configurations to help with JSDOM issues
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      NODE_ENV: "test",
    },
  },
  define: {
    // Ensure compatibility with SvelteKit
    __SVELTEKIT_DEV__: false,
    // Make Svelte think we're in a browser environment
    "import.meta.env.SSR": false,
  },
  // Resolve Svelte to client version for tests
  resolve: {
    conditions: ["browser"],
  },
});
