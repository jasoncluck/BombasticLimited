import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}", "cdk/**/*.{test,spec}.{js,ts}"],
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
      exclude: [
        "src/lib/components/ui/**",
        "src/lib/supabase/database.types.ts",
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
        "src/tests/**",
        "src/app.html",
        "src/app.css",
        "static/**",
        "cdk/test/**",
        "cdk/cdk.out/**"
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Higher thresholds for critical business logic
        "src/lib/utils.ts": {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        },
        "src/hooks.server.ts": {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
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
