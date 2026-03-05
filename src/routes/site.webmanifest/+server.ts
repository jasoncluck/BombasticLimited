import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const manifest = {
    name: 'Bombastic Limited',
    short_name: 'Bombastic',
    description: 'Bombastic Limited - The Good Stuff',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#8b5cf6',
    icons: [
      {
        src: '/favicon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };

  return json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
};
