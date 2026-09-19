import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  BUG_REPORT_IMAGES_BUCKET,
  presignPut,
  presignGet,
  deleteObject,
} from '$lib/server/s3';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// AWS SigV4 presigned URLs cap out at 7 days, unlike Supabase's 30-day
// signed URLs — the previous behavior can't be replicated exactly.
const GET_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function generateImageKey(originalName: string, userId?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const userPrefix = userId ? `user-${userId}` : 'anonymous';
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${userPrefix}/${timestamp}-${randomSuffix}.${extension}`;
}

export const POST: RequestHandler = async ({ request, locals: { userId } }) => {
  const { filename, contentType } = await request.json();

  if (!filename || !contentType || !ALLOWED_TYPES.includes(contentType)) {
    error(400, 'Invalid filename or content type');
  }

  const key = generateImageKey(filename, userId ?? undefined);
  const [putUrl, getUrl] = await Promise.all([
    presignPut(BUG_REPORT_IMAGES_BUCKET, key, contentType),
    presignGet(BUG_REPORT_IMAGES_BUCKET, key, GET_URL_EXPIRY_SECONDS),
  ]);

  return json({ putUrl, getUrl, key });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const { key } = await request.json();
  if (!key || typeof key !== 'string') {
    error(400, 'Missing key');
  }

  await deleteObject(BUG_REPORT_IMAGES_BUCKET, key);
  return json({ success: true });
};
