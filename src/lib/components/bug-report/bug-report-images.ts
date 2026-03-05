import type { ImageUploadResult } from './bug-report';
import { browser } from '$app/environment';

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 3;

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
 * Convert image to base64 for PostHog submission (small images only)
 * For larger images, we'll use a placeholder and store locally for manual processing
 */
async function convertToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Upload image for bug report - uses simple base64 approach for small images
 * For production, you might want to use Cloudinary, AWS S3, or similar service
 */
export async function uploadBugReportImage(
  file: File
): Promise<ImageUploadResult> {
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

    // For this implementation, we'll use a simple approach:
    // Convert to base64 and store in PostHog event data
    // This works for small images but for production, you'd want a proper image service

    if (processedFile.size > 2 * 1024 * 1024) {
      // Still > 2MB after compression
      return {
        success: false,
        error:
          'Image is still too large after compression. Please use a smaller image or lower quality.',
      };
    }

    const base64 = await convertToBase64(processedFile);

    // For this demo, we'll return the base64 URL
    // In production, you'd upload to a service and return the URL
    return {
      success: true,
      url: base64,
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    };
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
  maxImages: MAX_IMAGES,
  maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
} as const;
