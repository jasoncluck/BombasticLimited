import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import type { RequestEvent } from '@sveltejs/kit';

export const load = async ({ request }: RequestEvent) => {
  // Detect the optimal image format based on the Accept header
  const preferredImageFormat = detectOptimalFormat(
    request.headers.get('accept')
  );

  return {
    preferredImageFormat,
  };
};