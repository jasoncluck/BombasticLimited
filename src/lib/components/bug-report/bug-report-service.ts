import type { ImageUploadResult } from './bug-report';
import { browser } from '$app/environment';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';

// Configuration
const BUG_REPORTS_BUCKET = 'bug-report-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Validates an image file for bug report upload
 */
export function validateImageFile(file: File): {
  isValid: boolean;
  error?: string;
} {
  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images.',
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: 'File size too large. Please upload images smaller than 5MB.',
    };
  }

  return { isValid: true };
}

/**
 * Compress and resize image to reduce file size
 */
async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
      const width = img.width * ratio;
      const height = img.height * ratio;

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        file.type,
        quality
      );
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate a unique filename for the bug report image
 */
function generateImageFilename(originalName: string, userId?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const userPrefix = userId ? `user-${userId}` : 'anonymous';
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  return `${userPrefix}/${timestamp}-${randomSuffix}.${extension}`;
}

/**
 * Upload image to Supabase storage for bug report
 * This approach uploads to a dedicated bucket with proper file sanitization via server-side processing
 */
export async function uploadBugReportImageToSupabase({
  file,
  session,
  supabase,
}: {
  file: File;
  supabase: SupabaseClient;
  session: Session | null;
}): Promise<ImageUploadResult> {
  try {
    if (!browser) {
      return {
        success: false,
        error: 'Image upload only available in browser',
      };
    }

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Compress image if it's large
    let processedFile = file;
    if (file.size > 1024 * 1024) {
      // > 1MB
      processedFile = await compressImage(file);
    }

    // Check final size after compression
    if (processedFile.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error:
          'Image is still too large after compression. Please use a smaller image.',
      };
    }

    const filename = generateImageFilename(file.name, session?.user.id);

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(BUG_REPORTS_BUCKET)
      .upload(filename, processedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: processedFile.type,
      });

    if (error) {
      console.error('Supabase storage error:', error);
      return {
        success: false,
        error: `Upload failed: ${error.message}`,
      };
    }

    // Create a signed URL with 1 month expiry for the uploaded image
    const expiresIn = 30 * 24 * 60 * 60; // 30 days in seconds
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(BUG_REPORTS_BUCKET)
        .createSignedUrl(data.path, expiresIn);

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
      // Fallback to public URL if signed URL creation fails
      const { data: publicUrlData } = supabase.storage
        .from(BUG_REPORTS_BUCKET)
        .getPublicUrl(data.path);

      return {
        success: true,
        url: publicUrlData.publicUrl,
        path: data.path,
      };
    }

    return {
      success: true,
      url: signedUrlData.signedUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('Error uploading image to Supabase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    };
  }
}

/**
 * Delete an uploaded image from Supabase storage
 * Used for cleanup if bug report submission fails
 */
export async function deleteBugReportImage({
  path,
  supabase,
}: {
  path: string;
  supabase: SupabaseClient<Database>;
}): Promise<boolean> {
  try {
    if (!browser) {
      return false;
    }

    const { error } = await supabase.storage
      .from(BUG_REPORTS_BUCKET)
      .remove([path]);

    if (error) {
      console.error('Error deleting image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting image:', error);
    return false;
  }
}

/**
 * Create a preview URL for an image file
 */
export function createImagePreview(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Clean up image preview URL
 */
export function revokeImagePreview(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Get configuration limits
 */
export const IMAGE_UPLOAD_CONFIG = {
  maxFileSize: MAX_FILE_SIZE,
  allowedTypes: ALLOWED_TYPES,
  maxImages: 3,
  maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
  bucket: BUG_REPORTS_BUCKET,
} as const;
