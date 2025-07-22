import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter({
      runtime: "edge", // Changed from "edge" to support image processing
      images: {
        sizes: [
          16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920,
          2048, 3840,
        ],
        formats: ["image/webp", "image/avif"],
        minimumCacheTTL: 300,
        dangerouslyAllowSVG: false,
        contentSecurityPolicy:
          "default-src 'self'; script-src 'none'; sandbox;",
        remotePatterns: [
          {
            protocol: "https",
            hostname: "**.youtube.com",
          },
          {
            protocol: "https",
            hostname: "**.ytimg.com",
          },
          {
            protocol: "https",
            hostname: "**.twitch.tv",
          },
          {
            protocol: "https",
            hostname: "**.supabase.co",
          },
          {
            protocol: "https",
            hostname: "**", // Allow all HTTPS domains - you can restrict this further
          },
        ],
      },
    }),
    csp: {
      directives: {
        "script-src": [
          "self",
          "unsafe-inline",
          "ws://localhost:5173/",
          "https://www.youtube.com",
          "https://embed.twitch.tv/",
          "https://hguqxixjgwazwsuvhkmo.supabase.co",
        ],
      },
      // must be specified with either the `report-uri` or `report-to` directives, or both
    },
  },
};

export default config;
