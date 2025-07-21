import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: [
      "src/**/*.{test,spec}.{js,ts}",
      "src/**/*.{test,spec}.svelte.ts",
      "cdk/**/*.{test,spec}.{js,ts}",
      "src/tests/**/*.{test,spec}.{js,ts}",
    ],
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
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "src/**/*.svelte.ts", "src/**/*.svelte"],
      exclude: [
        "src/lib/components/ui/**",
        "src/lib/supabase/database.types.ts",
        "src/lib/test-utils/**",
        "src/tests/**",
        "**/*.d.ts",
        "**/node_modules/**",
        "**/dist/**",
        "**/.svelte-kit/**",
        "**/build/**",
        "**/*.config.*",
        "**/coverage/**",
        "**/*.test.*",
        "**/*.spec.*",
        "src/test-setup.ts",
        "src/app.html",
        "src/app.css",
        "static/**",
        "cdk/test/**",
        "cdk/cdk.out/**",
        "cdk/lib/lambda/populate-*.ts",
        "cdk/lib/stack/**",
        "cdk/bin/cdk.ts",
        "cdk/scripts/trigger-repopulate-combined.ts",
        "cdk/lib/lambda/client.ts",
      ],
      thresholds: {
        global: {
          branches: 67,
          functions: 35,
          lines: 10,
          statements: 10,
        },
        // Higher thresholds for critical business logic
        "src/lib/utils.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/hooks.server.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "cdk/lib/channel.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
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
