import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { enhancedImages } from "@sveltejs/enhanced-img";
import viteCompression from "vite-plugin-compression";

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), enhancedImages(), viteCompression()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    globals: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
