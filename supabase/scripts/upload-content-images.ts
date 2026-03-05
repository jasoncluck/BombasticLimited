import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'fs/promises';
import { join, relative, sep, extname } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

// Remote Supabase configuration
const remoteUrl = 'http://127.0.0.1:54321'; // Update if not using default port
const remoteKey =
  'YOUR_SUPABASE_SERVICE_ROLE_KEY'; // Replace with your actual service role key for full permissions

const bucketName = 'content-images';
const localUploadPath = join(process.cwd(), '../content-images');

const remoteSupabase = createClient(remoteUrl, remoteKey);

interface UploadStats {
  totalFiles: number;
  uploadedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  corruptedFiles: number;
}

const stats: UploadStats = {
  totalFiles: 0,
  uploadedFiles: 0,
  skippedFiles: 0,
  errorFiles: 0,
  corruptedFiles: 0,
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

// Image file extensions that we want to validate
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'bmp',
  'tiff',
  'tif',
  'ico',
  'heic',
  'heif',
]);

function getContentType(filePath: string): string {
  const fileExtension = extname(filePath).slice(1).toLowerCase();

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

/**
 * Validate that an image file has the correct magic bytes/signature
 */
function validateImageFile(buffer: Buffer, filePath: string): boolean {
  const extension = extname(filePath).slice(1).toLowerCase();

  if (!IMAGE_EXTENSIONS.has(extension)) {
    return true; // Not an image file, so we don't validate
  }

  // Check magic bytes for common image formats
  const first4Bytes = buffer.subarray(0, 4);
  const first8Bytes = buffer.subarray(0, 8);
  const first12Bytes = buffer.subarray(0, 12);

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      // JPEG files start with 0xFF 0xD8 and end with 0xFF 0xD9
      return buffer[0] === 0xff && buffer[1] === 0xd8;

    case 'png':
      // PNG files start with: 89 50 4E 47 0D 0A 1A 0A
      return first8Bytes.equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );

    case 'gif':
      // GIF files start with "GIF87a" or "GIF89a"
      return (
        buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
      );

    case 'webp':
      // WebP files start with "RIFF" and have "WEBP" at bytes 8-11
      return (
        first4Bytes.toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );

    case 'bmp':
      // BMP files start with "BM"
      return buffer.subarray(0, 2).toString('ascii') === 'BM';

    case 'tiff':
    case 'tif':
      // TIFF files start with "II*\0" (little-endian) or "MM\0*" (big-endian)
      return (
        first4Bytes.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        first4Bytes.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
      );

    case 'ico':
      // ICO files start with 00 00 01 00
      return first4Bytes.equals(Buffer.from([0x00, 0x00, 0x01, 0x00]));

    case 'svg':
      // SVG files are XML, so check for XML or SVG tag
      const start = buffer.subarray(0, 100).toString('utf8').toLowerCase();
      return start.includes('<svg') || start.includes('<?xml');

    case 'avif':
      // AVIF files are based on HEIF container
      return (
        buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
        buffer.subarray(8, 12).toString('ascii') === 'avif'
      );

    case 'heic':
    case 'heif':
      // HEIC/HEIF files have "ftyp" at bytes 4-7 and format identifier after that
      const ftypHeader = buffer.subarray(4, 8).toString('ascii');
      const brandCode = buffer.subarray(8, 12).toString('ascii');
      return (
        ftypHeader === 'ftyp' &&
        (brandCode === 'heic' || brandCode === 'mif1' || brandCode === 'msf1')
      );

    default:
      return true; // Unknown image type, assume valid
  }
}

/**
 * Calculate MD5 hash of file content for integrity checking
 */
function calculateFileHash(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

/**
 * Verify uploaded file by downloading and comparing hash
 */
async function verifyUploadedFile(
  supabasePath: string,
  originalHash: string,
  fileSize: number
): Promise<boolean> {
  try {
    const { data: downloadedFile, error: downloadError } =
      await remoteSupabase.storage.from(bucketName).download(supabasePath);

    if (downloadError) {
      console.error(
        `  🔍 Failed to download ${supabasePath} for verification:`,
        downloadError
      );
      return false;
    }

    if (!downloadedFile) {
      console.error(`  🔍 No data received when downloading ${supabasePath}`);
      return false;
    }

    // Convert Blob to Buffer for comparison
    const downloadedBuffer = Buffer.from(await downloadedFile.arrayBuffer());

    // Check file size first
    if (downloadedBuffer.length !== fileSize) {
      console.error(
        `  🔍 Size mismatch for ${supabasePath}: expected ${fileSize}, got ${downloadedBuffer.length}`
      );
      return false;
    }

    // Check MD5 hash
    const downloadedHash = calculateFileHash(downloadedBuffer);
    const hashMatch = downloadedHash === originalHash;

    if (!hashMatch) {
      console.error(
        `  🔍 Hash mismatch for ${supabasePath}: expected ${originalHash}, got ${downloadedHash}`
      );
    }

    return hashMatch;
  } catch (error) {
    console.error(`  🔍 Error verifying ${supabasePath}:`, error);
    return false;
  }
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
    console.log(`Corrupted files detected: ${stats.corruptedFiles}`);
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

async function uploadFolder(folderPath: string): Promise<void> {
  try {
    const items = await readdir(folderPath, { withFileTypes: true });

    // Process files in smaller batches to be more conservative
    const batchSize = 5; // Reduced batch size for better reliability
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

      // Add a longer delay to avoid rate limiting and give Supabase time to process
      await new Promise((resolve) => setTimeout(resolve, 500));
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

    // Validate file integrity
    if (!validateImageFile(fileBuffer, localFilePath)) {
      console.error(
        `  🚫 File validation failed for ${supabasePath} - appears to be corrupted or invalid`
      );
      stats.corruptedFiles++;
      stats.errorFiles++;
      return;
    }

    // Calculate file hash for verification
    const originalHash = calculateFileHash(fileBuffer);
    const fileSize = fileBuffer.length;

    // Determine content type based on file extension
    const contentType = getContentType(localFilePath);

    console.log(
      `  📁 Uploading ${supabasePath} (${contentType}, ${fileSize} bytes)`
    );

    // Create a new Uint8Array from the buffer to ensure proper binary handling
    const uploadData = new Uint8Array(fileBuffer);

    // Upload to Supabase with proper binary data handling
    const { data: uploadResult, error: uploadError } =
      await remoteSupabase.storage
        .from(bucketName)
        .upload(supabasePath, uploadData, {
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
          `  🔍 File extension: .${extname(localFilePath).slice(1).toLowerCase()}`
        );
      }

      stats.errorFiles++;
      return;
    }

    console.log(`  ✅ Uploaded: ${supabasePath}`);

    // Verify the uploaded file integrity
    console.log(`  🔍 Verifying upload integrity for ${supabasePath}...`);
    const isValid = await verifyUploadedFile(
      supabasePath,
      originalHash,
      fileSize
    );

    if (!isValid) {
      console.error(
        `  ❌ Upload verification failed for ${supabasePath} - file may be corrupted`
      );
      stats.corruptedFiles++;
      stats.errorFiles++;

      // Optionally delete the corrupted file
      const { error: deleteError } = await remoteSupabase.storage
        .from(bucketName)
        .remove([supabasePath]);

      if (deleteError) {
        console.error(
          `  ❌ Failed to delete corrupted file ${supabasePath}:`,
          deleteError
        );
      } else {
        console.log(`  🗑️  Deleted corrupted file ${supabasePath}`);
      }
      return;
    }

    console.log(`  ✅ Upload verification passed for ${supabasePath}`);
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
