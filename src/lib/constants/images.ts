import type { Database } from '$lib/supabase/database.types';

export type ImageProcessingStatus =
  Database['public']['Enums']['image_processing_status'];
export const IMAGES_BUCKET = 'content-images';
