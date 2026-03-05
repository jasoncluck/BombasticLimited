import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import remarkGfm from 'remark-gfm';
import remarkSlug from 'remark-slug';

// Derive the Supabase origin for CSP from the env var so the project URL is
// never hardcoded in source. PUBLIC_SUPABASE_URL must be set as a real process
// env var (Vercel env var, or exported in your shell) for production builds.
const supabaseOrigin = process.env.PUBLIC_SUPABASE_URL
  ? new URL(process.env.PUBLIC_SUPABASE_URL).origin
  : null;

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
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': [
            'self',
            // PostHog analytics
            'https://alpine.bombastic.ltd',
            // AdSense & Google Ad domains
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://www.gstatic.com',
            'https://pagead2.googlesyndication.com',
            'https://securepubads.g.doubleclick.net',
            'https://partner.googleadservices.com',
            'https://googletagservices.com',
            'https://fundingchoicesmessages.google.com',
            // YouTube domains
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            'https://imasdk.googleapis.com',
            // Twitch core domains
            'https://gql.twitch.tv',
            'https://embed.twitch.tv',
            'https://player.twitch.tv',
            'https://www.twitch.tv',
            'https://id.twitch.tv',
            'https://passport.twitch.tv',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
            'https://static-cdn.jtvnw.net',
            'https://cvp.twitch.tv',
            'https://spade.twitch.tv',
            'https://usher.ttvnw.net',
            'https://client-event-reporter.twitch.tv',
            // Supabase
            ...(supabaseOrigin ? [supabaseOrigin] : []),
          ],
          'frame-src': [
            'self',
            // AdSense & Google Ad domains
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://securepubads.g.doubleclick.net',
            'https://pubads.g.doubleclick.net',
            'https://googletagservices.com',
            'https://fundingchoicesmessages.google.com',
            // YouTube domains
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            'https://imasdk.googleapis.com',
            // Twitch domains
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
            'https://googletagservices.com',
          ],
          'frame-ancestors': ['self'],
          'connect-src': [
            'self',
            // PostHog analytics
            'https://alpine.bombastic.ltd',
            // AdSense & Google Ad domains
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://www.googletagmanager.com',
            'https://stats.g.doubleclick.net',
            'https://cm.g.doubleclick.net',
            'https://securepubads.g.doubleclick.net',
            'https://pagead2.googlesyndication.com',
            'https://pubads.g.doubleclick.net',
            'https://partner.googleadservices.com',
            'https://googletagservices.com',
            'https://fundingchoicesmessages.google.com',
            // YouTube domains
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            'https://imasdk.googleapis.com',
            // Twitch domains
            'https://api.twitch.tv',
            'https://gql.twitch.tv',
            'https://usher.ttvnw.net',
            'https://www.twitch.tv',
            'https://id.twitch.tv',
            'https://passport.twitch.tv',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
            'https://static-cdn.jtvnw.net',
            'wss://irc-ws.chat.twitch.tv',
            'wss://pubsub-edge.twitch.tv',
            'https://cvp.twitch.tv',
            'https://spade.twitch.tv',
            'https://pubsub-edge.twitch.tv',
            'https://client-event-reporter.twitch.tv',
            // Twitch video streaming domains
            'https://*.hls.ttvnw.net',
            'https://*.playlist.live-video.net',
            'https://*.playlist.ttvnw.net',
            // Supabase
            ...(supabaseOrigin ? [supabaseOrigin] : []),
          ],
          'img-src': [
            'self',
            'data:',
            'blob:',
            // AdSense & Google Ad domains
            'https://www.google.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://tpc.googlesyndication.com',
            'https://cm.g.doubleclick.net',
            'https://stats.g.doubleclick.net',
            'https://securepubads.g.doubleclick.net',
            'https://pagead2.googlesyndication.com',
            'https://www.gstatic.com',
            'https://pubads.g.doubleclick.net',
            'https://partner.googleadservices.com',
            // YouTube domains
            'https://i.ytimg.com',
            'https://s.ytimg.com',
            'https://yt3.ggpht.com',
            'https://www.youtube-nocookie.com',
            // Twitch domains
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
            'https://*.googlevideo.com',
            'https://googleads.g.doubleclick.net',
            'https://www.youtube-nocookie.com',
            // Twitch video streaming domains
            'https://vod-secure.twitch.tv',
            'https://vod-metro.twitch.tv',
            'https://clips-media-assets2.twitch.tv',
            'https://*.hls.ttvnw.net',
            'https://*.playlist.live-video.net',
            'https://*.playlist.ttvnw.net',
          ],
          'style-src': [
            'self',
            // Google domains
            'https://www.youtube.com',
            'https://fonts.googleapis.com',
            'https://googleads.g.doubleclick.net',
            'https://www.googlesyndication.com',
            'https://www.gstatic.com',
            'https://www.youtube-nocookie.com',
            'https://googletagservices.com',
            // Twitch domains
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
            'https://static-cdn.jtvnw.net',
          ],
          'font-src': [
            'self',
            'https://fonts.gstatic.com',
            'https://www.youtube.com',
            'https://www.gstatic.com',
            'https://static.twitchcdn.net',
            'https://assets.twitch.tv',
            'https://static-cdn.jtvnw.net',
          ],
          'worker-src': ['self', 'blob:'],
          'object-src': ['none'],
          'base-uri': ['self'],
          'form-action': ['self'],
        },
      },
    }),
  },
};

export default config;
