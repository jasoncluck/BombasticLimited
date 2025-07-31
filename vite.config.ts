import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { enhancedImages } from "@sveltejs/enhanced-img";
import viteCompression from "vite-plugin-compression";

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), enhancedImages(), viteCompression()],
  build: {
    minify: false, // Set to false to disable minification
  },
  test: {
    setupFiles: [],
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
