import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import remarkGfm from 'remark-gfm';
import remarkSlug from 'remark-slug';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte', '.md', '.svx'],
  preprocess: [
    vitePreprocess(),
    mdsvex({
      extensions: ['.md', '.svx'],
      remarkPlugins: [remarkGfm, remarkSlug],
    }),
  ],
  kit: {
    adapter: adapter({
      csp: {
        mode: 'hash',
        directives: {
          'default-src': ['self'],
          'script-src': [
            'self',
            'unsafe-eval', // Required for AdSense
            'unsafe-inline', // Sometimes needed for AdSense
            // YouTube & Google Ad domains (essential only)
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://www.gstatic.com',
            'https://pagead2.googlesyndication.com',
            'https://securepubads.g.doubleclick.net',
            'https://www.youtube-nocookie.com',
            'https://imasdk.googleapis.com',
            'https://partner.googleadservices.com', // Additional AdSense domain
            'https://googletagservices.com', // Additional Google domain
            // Twitch core domains (specific CloudFront domains)
            'https://gql.twitch.tv',
            'https://embed.twitch.tv',
            'https://player.twitch.tv',
            'https://www.twitch.tv',
            'https://id.twitch.tv',
            'https://passport.twitch.tv',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
            'https://d2v02itv0y9u9t.cloudfront.net', // Specific Twitch CloudFront
            'https://cvp.twitch.tv',
            'https://spade.twitch.tv',
            'https://pubsub-edge.twitch.tv',
            'https://usher.ttvnw.net',
            // Supabase
            'https://hguqxixjgwazwsuvhkmo.supabase.co',
          ],
          'frame-src': [
            'self',
            // YouTube & Google Ad domains
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://securepubads.g.doubleclick.net',
            'https://www.youtube-nocookie.com',
            'https://imasdk.googleapis.com',
            'https://pubads.g.doubleclick.net',
            'https://partner.googleadservices.com', // Additional AdSense domain
            // Twitch core domains
            'https://embed.twitch.tv',
            'https://player.twitch.tv',
            'https://www.twitch.tv',
            'https://id.twitch.tv',
            'https://passport.twitch.tv',
          ],
          'child-src': [
            'self',
            'https://embed.twitch.tv',
            'https://player.twitch.tv',
            'https://www.twitch.tv',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://imasdk.googleapis.com',
            'https://pubads.g.doubleclick.net',
            'https://partner.googleadservices.com',
          ],
          'frame-ancestors': ['self'],
          'connect-src': [
            'self',
            // YouTube & Google Ad domains
            'https://www.youtube.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://stats.g.doubleclick.net',
            'https://cm.g.doubleclick.net',
            'https://securepubads.g.doubleclick.net',
            'https://pagead2.googlesyndication.com',
            'https://www.youtube-nocookie.com',
            'https://imasdk.googleapis.com',
            'https://pubads.g.doubleclick.net',
            'https://partner.googleadservices.com',
            'https://googletagservices.com',
            'https://adnxs.com', // Additional ad network
            // Twitch core domains
            'https://api.twitch.tv',
            'https://gql.twitch.tv',
            'https://usher.ttvnw.net',
            'https://www.twitch.tv',
            'https://id.twitch.tv',
            'https://passport.twitch.tv',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
            'wss://irc-ws.chat.twitch.tv',
            'wss://pubsub-edge.twitch.tv',
            'https://cvp.twitch.tv',
            'https://spade.twitch.tv',
            'https://pubsub-edge.twitch.tv',
            // Supabase
            'https://hguqxixjgwazwsuvhkmo.supabase.co',
          ],
          'img-src': [
            'self',
            'data:',
            'blob:',
            // YouTube & Google Ad domains
            'https://i.ytimg.com',
            'https://s.ytimg.com',
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://cm.g.doubleclick.net',
            'https://stats.g.doubleclick.net',
            'https://securepubads.g.doubleclick.net',
            'https://pagead2.googlesyndication.com',
            'https://www.gstatic.com',
            'https://yt3.ggpht.com',
            'https://www.youtube-nocookie.com',
            'https://pubads.g.doubleclick.net',
            'https://partner.googleadservices.com',
            'https://*.googleusercontent.com', // For Google hosted images
            // Twitch core domains
            'https://static-cdn.jtvnw.net',
            'https://clips-media-assets2.twitch.tv',
            'https://vod-secure.twitch.tv',
            'https://vod-metro.twitch.tv',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
          ],
          'media-src': [
            'self',
            'blob:',
            'data:',
            // YouTube & Google domains
            'https://www.youtube.com',
            'https://googlevideo.com',
            'https://*.googlevideo.com', // This wildcard is necessary for YouTube video delivery
            'https://googleads.g.doubleclick.net',
            'https://www.youtube-nocookie.com',
            // Twitch core domains
            'https://vod-secure.twitch.tv',
            'https://vod-metro.twitch.tv',
            'https://clips-media-assets2.twitch.tv',
          ],
          'style-src': [
            'self',
            'unsafe-inline',
            // YouTube & Google domains
            'https://www.youtube.com',
            'https://fonts.googleapis.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://www.gstatic.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
          ],
          'font-src': [
            'self',
            'https://fonts.gstatic.com',
            'https://www.youtube.com',
            'https://www.gstatic.com',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
          ],
          'worker-src': ['self', 'blob:'],
          'object-src': ['none'],
          'base-uri': ['self'], // Prevents base tag hijacking
          'form-action': ['self'], // Restricts form submissions
        },
      },
    }),
  },
};

export default config;
