import adapter from "@sveltejs/adapter-netlify";
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
    adapter: adapter(),
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
