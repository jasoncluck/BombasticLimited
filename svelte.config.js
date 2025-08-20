import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import remarkGfm from 'remark-gfm';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  extensions: ['.svelte', '.md', '.svx'],
  preprocess: [
    vitePreprocess(),
    mdsvex({
      extensions: ['.md', '.svx'],
      layout: resolve(
        __dirname,
        './src/lib/components/mdsvex/MdsvexLayout.svelte'
      ),
      remarkPlugins: [remarkGfm],
    }),
  ],
  kit: {
    // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter({
      csp: {
        directives: {
          'script-src': [
            'self',
            'unsafe-inline',
            'unsafe-eval', // Required for some YouTube ads
            'ws://localhost:5173/',
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://googletagmanager.com',
            'https://gql.twitch.tv',
            'https://s.ytimg.com',
            'https://embed.twitch.tv/',
            'https://player.twitch.tv/',
            'https://www.twitch.tv/',
            'https://d2v02itv0y9u9t.cloudfront.net', // Twitch analytics/stats
            'https://*.cloudfront.net', // Allow other Twitch CloudFront resources
            'https://hguqxixjgwazwsuvhkmo.supabase.co',
          ],
          'frame-src': [
            'self',
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://embed.twitch.tv/',
            'https://player.twitch.tv/',
            'https://www.twitch.tv/',
          ],
          'connect-src': [
            'self',
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://stats.g.doubleclick.net',
            'https://cm.g.doubleclick.net',
            'https://api.twitch.tv/',
            'https://gql.twitch.tv/',
            'https://usher.ttvnw.net/',
            'https://www.twitch.tv/',
            'https://d2v02itv0y9u9t.cloudfront.net', // Twitch analytics
            'https://*.cloudfront.net', // Twitch CDN resources
            'wss://irc-ws.chat.twitch.tv/',
            'https://gql.twitch.tv',
            'https://hguqxixjgwazwsuvhkmo.supabase.co',
            'ws://localhost:5173/', // For development
          ],
          'img-src': [
            'self',
            'data:',
            'https://i.ytimg.com',
            'https://s.ytimg.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://cm.g.doubleclick.net',
            'https://stats.g.doubleclick.net',
            'https://static-cdn.jtvnw.net/',
            'https://clips-media-assets2.twitch.tv/',
            'https://vod-secure.twitch.tv/',
            'https://vod-metro.twitch.tv/',
            'https://*.cloudfront.net', // Twitch images via CloudFront
          ],
          'media-src': [
            'self',
            'https://www.youtube.com',
            'https://googlevideo.com',
            'https://*.googlevideo.com',
            'https://googleads.g.doubleclick.net',
            'https://vod-secure.twitch.tv/',
            'https://vod-metro.twitch.tv/',
            'https://clips-media-assets2.twitch.tv/',
            'https://*.cloudfront.net', // Twitch video content via CloudFront
          ],
          'style-src': [
            'self',
            'unsafe-inline', // YouTube ads often require inline styles
            'https://www.youtube.com',
            'https://fonts.googleapis.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
          ],
          'font-src': [
            'self',
            'https://fonts.gstatic.com',
            'https://www.youtube.com',
          ],
          'worker-src': ['self', 'blob:'],
          'object-src': ['none'],
        },
      },
    }),
  },
};

export default config;
