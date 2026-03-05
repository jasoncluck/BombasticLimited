import { IMAGES_BUCKET } from '$lib/constants/images';
import type { Database } from '$lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Converts a data URL to a File object
 */
export function dataURLtoFile(dataURL: string, filename: string): File {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * Deletes a playlist image from Supabase Storage
 */
export async function deletePlaylistImage({
  imagePath,
  supabase,
}: {
  imagePath: string;
  supabase: SupabaseClient<Database>;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase.storage
      .from(IMAGES_BUCKET)
      .remove([imagePath]);

    if (error) {
      console.error('Storage deletion error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (err) {
    console.error('Deletion error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
