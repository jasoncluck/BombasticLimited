import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const thumbnailUrl = url.searchParams.get('url');
  const thumbnailMaxResUrl = url.searchParams.get('maxresUrl');

  if (!thumbnailUrl && !thumbnailMaxResUrl) {
    throw error(400, 'Missing thumbnail URL parameter (url or maxresUrl)');
  }

  // Simply redirect to the original image - no server-side processing
  const effectiveUrl = thumbnailMaxResUrl || thumbnailUrl;
  if (!effectiveUrl) {
    throw error(400, 'No valid image URL provided');
  }

  // Redirect to original YouTube thumbnail (no Sharp processing)
  return Response.redirect(effectiveUrl, 302);
};
