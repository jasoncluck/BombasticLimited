import { createClient } from '@supabase/supabase-js';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, sep } from 'path';
import { existsSync } from 'fs';

// Remote Supabase configuration
const remoteUrl = 'http://127.0.0.1:54321';
const remoteKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const bucketName = 'content-images';
const localUploadPath = join(process.cwd(), '../content-images');

const remoteSupabase = createClient(remoteUrl, remoteKey);

interface UploadStats {
  totalFiles: number;
  uploadedFiles: number;
  skippedFiles: number;
  errorFiles: number;
}

const stats: UploadStats = {
  totalFiles: 0,
  uploadedFiles: 0,
  skippedFiles: 0,
  errorFiles: 0,
};

// Comprehensive MIME type mapping for images and other common file types
const CONTENT_TYPES: Record<string, string> = {
  // Image formats
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
  // Video formats (in case you need them)
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  // Document formats
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  xml: 'application/xml',
  csv: 'text/csv',
};

function getContentType(filePath: string): string {
  const fileExtension = filePath.split('.').pop()?.toLowerCase();

  if (!fileExtension) {
    console.warn(
      `  ⚠️  No file extension found for ${filePath}, using default MIME type`
    );
    return 'application/octet-stream';
  }

  const contentType = CONTENT_TYPES[fileExtension];

  if (!contentType) {
    console.warn(
      `  ⚠️  Unknown file extension .${fileExtension} for ${filePath}, using default MIME type`
    );
    return 'application/octet-stream';
  }

  return contentType;
}

async function uploadContentImages(): Promise<void> {
  try {
    console.log('Starting content images upload...');
    console.log(`Upload path: ${localUploadPath}`);

    // Check if the upload directory exists
    if (!existsSync(localUploadPath)) {
      console.error(`Upload directory does not exist: ${localUploadPath}`);
      return;
    }

    // Upload all files from local directory
    await uploadFolder(localUploadPath);

    console.log('\n=== Upload Complete ===');
    console.log(`Total files found: ${stats.totalFiles}`);
    console.log(`Files uploaded: ${stats.uploadedFiles}`);
    console.log(`Files skipped (already exist): ${stats.skippedFiles}`);
    console.log(`Files with errors: ${stats.errorFiles}`);
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

async function uploadFolder(folderPath: string): Promise<void> {
  try {
    const items = await readdir(folderPath, { withFileTypes: true });

    // Process files in parallel batches to speed up upload
    const batchSize = 10; // Reduced batch size to be more conservative with API calls
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (item) => {
          const fullLocalPath = join(folderPath, item.name);

          if (item.isDirectory()) {
            // It's a folder, recurse into it
            console.log(
              `Processing folder: ${relative(localUploadPath, fullLocalPath)}`
            );
            await uploadFolder(fullLocalPath);
          } else {
            // It's a file, upload it
            stats.totalFiles++;
            await uploadFile(fullLocalPath);
          }
        })
      );

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    console.error(`Error processing folder ${folderPath}:`, error);
  }
}

async function uploadFile(localFilePath: string): Promise<void> {
  try {
    // Calculate the relative path from the base upload directory
    const relativePath = relative(localUploadPath, localFilePath);
    // Convert Windows path separators to forward slashes for Supabase
    const supabasePath = relativePath.split(sep).join('/');

    // Check if file already exists in Supabase
    const { data: existingFile, error: checkError } =
      await remoteSupabase.storage.from(bucketName).download(supabasePath);

    if (!checkError && existingFile) {
      console.log(
        `  ⏭️  Skipping ${supabasePath} - already exists in Supabase`
      );
      stats.skippedFiles++;
      return;
    }

    // Read the local file
    const fileBuffer = await readFile(localFilePath);

    // Determine content type based on file extension
    const contentType = getContentType(localFilePath);

    console.log(`  📁 Uploading ${supabasePath} (${contentType})`);

    // Upload to Supabase
    const { data: uploadData, error: uploadError } =
      await remoteSupabase.storage
        .from(bucketName)
        .upload(supabasePath, fileBuffer, {
          contentType,
          cacheControl: '3600',
          upsert: false, // Don't overwrite existing files
        });

    if (uploadError) {
      console.error(`  ❌ Error uploading ${supabasePath}:`, uploadError);

      // If it's a MIME type error, show the detected content type for debugging
      if (
        uploadError.message?.includes('mime type') ||
        uploadError.message?.includes('not supported')
      ) {
        console.error(`  🔍 Detected content type: ${contentType}`);
        console.error(
          `  🔍 File extension: .${localFilePath.split('.').pop()?.toLowerCase()}`
        );
      }

      stats.errorFiles++;
      return;
    }

    console.log(`  ✅ Uploaded: ${supabasePath}`);
    stats.uploadedFiles++;
  } catch (error) {
    const relativePath = relative(localUploadPath, localFilePath);
    const supabasePath = relativePath.split(sep).join('/');
    console.error(`  ❌ Error uploading ${supabasePath}:`, error);
    stats.errorFiles++;
  }
}

// Run the upload
uploadContentImages();
