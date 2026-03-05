import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const baseUrl = 'https://bombastic.ltd';

  // Static pages
  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/giantbomb', priority: '0.9', changefreq: 'daily' },
    { url: '/jeffgerstmann', priority: '0.9', changefreq: 'daily' },
    { url: '/nextlander', priority: '0.9', changefreq: 'daily' },
    { url: '/remap', priority: '0.9', changefreq: 'daily' },
    { url: '/continue', priority: '0.8', changefreq: 'weekly' },
    { url: '/search', priority: '0.7', changefreq: 'weekly' },
    { url: '/getting-started', priority: '0.6', changefreq: 'monthly' },
    { url: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { url: '/cookies', priority: '0.3', changefreq: 'yearly' },
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <priority>${page.priority}</priority>
    <changefreq>${page.changefreq}</changefreq>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=3600',
    },
  });
};
