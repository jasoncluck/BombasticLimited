import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import remarkGfm from 'remark-gfm';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  extensions: ['.svelte', '.md', '.svx'],
  preprocess: [
    vitePreprocess(),
    mdsvex({
      extensions: ['.md', '.svx'],
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
            // YouTube & Google Ad domains
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://googletagmanager.com',
            'https://s.ytimg.com',
            'https://www.gstatic.com',
            'https://pagead2.googlesyndication.com',
            'https://partner.googleadservices.com',
            'https://securepubads.g.doubleclick.net',
            'https://yt3.ggpht.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
            'https://gql.twitch.tv',
            'https://embed.twitch.tv/',
            'https://player.twitch.tv/',
            'https://www.twitch.tv/',
            'https://id.twitch.tv/',
            'https://passport.twitch.tv/',
            'https://static.twitchcdn.net/',
            'https://assets.twitch.tv/',
            'https://d2v02itv0y9u9t.cloudfront.net', // Twitch analytics/stats
            'https://*.cloudfront.net', // Allow other Twitch CloudFront resources
            'https://cvp.twitch.tv/',
            'https://spade.twitch.tv/',
            'https://pubsub-edge.twitch.tv/',
            'https://video-weaver.*.hls.ttvnw.net/',
            'https://usher.ttvnw.net/',
            // Additional Twitch ad-related domains
            'https://ads.twitch.tv/',
            'https://amazon-adsystem.com/',
            'https://s.amazon-adsystem.com/',
            'https://c.amazon-adsystem.com/',
            'https://fls-na.amazon-adsystem.com/',
            // Supabase
            'https://hguqxixjgwazwsuvhkmo.supabase.co',
          ],
          'frame-src': [
            'self',
            // YouTube & Google Ad domains
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://securepubads.g.doubleclick.net',
            'https://googleadservices.com',
            'https://www.googleadservices.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
            'https://embed.twitch.tv/',
            'https://player.twitch.tv/',
            'https://www.twitch.tv/',
            'https://id.twitch.tv/',
            'https://passport.twitch.tv/',
            // Additional Twitch ad-related domains
            'https://ads.twitch.tv/',
            'https://amazon-adsystem.com/',
            'https://s.amazon-adsystem.com/',
            'https://c.amazon-adsystem.com/',
            'https://fls-na.amazon-adsystem.com/',
          ],
          'connect-src': [
            'self',
            // YouTube & Google Ad domains
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://stats.g.doubleclick.net',
            'https://cm.g.doubleclick.net',
            'https://securepubads.g.doubleclick.net',
            'https://pagead2.googlesyndication.com',
            'https://partner.googleadservices.com',
            'https://yt3.ggpht.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
            'https://api.twitch.tv/',
            'https://gql.twitch.tv/',
            'https://usher.ttvnw.net/',
            'https://www.twitch.tv/',
            'https://id.twitch.tv/',
            'https://passport.twitch.tv/',
            'https://d2v02itv0y9u9t.cloudfront.net', // Twitch analytics
            'https://*.cloudfront.net', // Twitch CDN resources
            'wss://irc-ws.chat.twitch.tv/',
            'wss://pubsub-edge.twitch.tv/',
            'https://cvp.twitch.tv/',
            'https://spade.twitch.tv/',
            'https://pubsub-edge.twitch.tv/',
            'https://video-weaver.*.hls.ttvnw.net/',
            // Additional Twitch ad-related domains
            'https://ads.twitch.tv/',
            'https://amazon-adsystem.com/',
            'https://s.amazon-adsystem.com/',
            'https://c.amazon-adsystem.com/',
            'https://fls-na.amazon-adsystem.com/',
            // Supabase
            'https://hguqxixjgwazwsuvhkmo.supabase.co',
            // Development
            'ws://localhost:5173/', // For development
          ],
          'img-src': [
            'self',
            'data:',
            // YouTube & Google Ad domains
            'https://i.ytimg.com',
            'https://s.ytimg.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://cm.g.doubleclick.net',
            'https://stats.g.doubleclick.net',
            'https://securepubads.g.doubleclick.net',
            'https://pagead2.googlesyndication.com',
            'https://www.gstatic.com',
            'https://yt3.ggpht.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
            'https://static-cdn.jtvnw.net/',
            'https://clips-media-assets2.twitch.tv/',
            'https://vod-secure.twitch.tv/',
            'https://vod-metro.twitch.tv/',
            'https://*.cloudfront.net', // Twitch images via CloudFront
            'https://static.twitchcdn.net/',
            'https://assets.twitch.tv/',
            // Additional Twitch ad-related domains
            'https://ads.twitch.tv/',
            'https://amazon-adsystem.com/',
            'https://s.amazon-adsystem.com/',
            'https://c.amazon-adsystem.com/',
            'https://fls-na.amazon-adsystem.com/',
          ],
          'media-src': [
            'self',
            // YouTube & Google domains
            'https://www.youtube.com',
            'https://googlevideo.com',
            'https://*.googlevideo.com',
            'https://googleads.g.doubleclick.net',
            'https://www.youtube-nocookie.com',
            'blob:', // Required for some video players
            // Twitch domains
            'https://vod-secure.twitch.tv/',
            'https://vod-metro.twitch.tv/',
            'https://clips-media-assets2.twitch.tv/',
            'https://*.cloudfront.net', // Twitch video content via CloudFront
            'https://video-weaver.*.hls.ttvnw.net/',
            // Additional Twitch ad-related domains
            'https://ads.twitch.tv/',
            'https://amazon-adsystem.com/',
            'https://s.amazon-adsystem.com/',
            'https://c.amazon-adsystem.com/',
            'https://fls-na.amazon-adsystem.com/',
          ],
          'style-src': [
            'self',
            'unsafe-inline', // YouTube ads often require inline styles
            // YouTube & Google domains
            'https://www.youtube.com',
            'https://fonts.googleapis.com',
            'https://googleads.g.doubleclick.net',
            'https://googlesyndication.com',
            'https://www.googlesyndication.com',
            'https://www.gstatic.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
            'https://static.twitchcdn.net/',
            'https://assets.twitch.tv/',
            // Additional ad-related domains
            'https://amazon-adsystem.com/',
            'https://s.amazon-adsystem.com/',
          ],
          'font-src': [
            'self',
            'https://fonts.gstatic.com',
            'https://www.youtube.com',
            'https://www.gstatic.com',
            'https://static.twitchcdn.net/',
          ],
          'worker-src': ['self', 'blob:'],
          'object-src': ['none'],
        },
      },
    }),
  },
};

export default config;
