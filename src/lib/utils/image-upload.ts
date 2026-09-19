import { CONTENT_IMAGES_BUCKET, deleteObject } from '$lib/server/s3';

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
 * Deletes a playlist image from S3 (content-images bucket)
 */
export async function deletePlaylistImage({
  imagePath,
}: {
  imagePath: string;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await deleteObject(CONTENT_IMAGES_BUCKET, imagePath);
    return { success: true };
  } catch (err) {
    console.error('Deletion error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
