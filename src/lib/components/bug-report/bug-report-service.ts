import type { ImageUploadResult } from './bug-report';
import { browser } from '$app/environment';

// Configuration
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
 * Upload image to S3 for a bug report. Gets a presigned PUT URL (and a
 * presigned GET URL for display) from the server, then uploads directly
 * to S3 from the browser.
 */
export async function uploadBugReportImage({
  file,
}: {
  file: File;
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

    const urlResponse = await fetch('/api/bug-report/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: processedFile.type,
      }),
    });

    if (!urlResponse.ok) {
      return { success: false, error: 'Failed to prepare upload' };
    }

    const { putUrl, getUrl, key } = await urlResponse.json();

    const putResponse = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': processedFile.type },
      body: processedFile,
    });

    if (!putResponse.ok) {
      return { success: false, error: 'Upload failed' };
    }

    return { success: true, url: getUrl, path: key };
  } catch (error) {
    console.error('Error uploading bug report image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    };
  }
}

/**
 * Delete an uploaded image from S3.
 * Used for cleanup if bug report submission fails.
 */
export async function deleteBugReportImage({
  path,
}: {
  path: string;
}): Promise<boolean> {
  try {
    if (!browser) {
      return false;
    }

    const response = await fetch('/api/bug-report/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: path }),
    });

    return response.ok;
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
} as const;
