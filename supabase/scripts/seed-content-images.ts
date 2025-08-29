import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// Remote Supabase configuration
const remoteUrl = 'https://blrvnfwxtzzbofsdrvwv.supabase.co';
const remoteKey = 'sb_secret_KbOPFiPjUeHUVd0jPTV1Kg_Rndl23de';

const bucketName = 'content-images';
const localDownloadPath = join(process.cwd(), '../content-images');

const remoteSupabase = createClient(remoteUrl, remoteKey);

interface DownloadStats {
  totalFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  invalidFiles: number;
  mimeTypeBreakdown: Record<string, number>;
  apiCalls: number;
}

interface MimeDetectionResult {
  detectedMimeType: string;
  isValid: boolean;
  errorMessage?: string;
}

interface RateLimitConfig {
  maxConcurrent: number;
  delayBetweenBatches: number;
  retryDelay: number;
  maxRetries: number;
}

interface StorageFileItem {
  name: string;
  id: string | null;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: Record<string, unknown>;
}

const stats: DownloadStats = {
  totalFiles: 0,
  downloadedFiles: 0,
  skippedFiles: 0,
  errorFiles: 0,
  invalidFiles: 0,
  mimeTypeBreakdown: {},
  apiCalls: 0,
};

// Optimized rate limiting configuration
const RATE_LIMIT: RateLimitConfig = {
  maxConcurrent: 20,
  delayBetweenBatches: 300,
  retryDelay: 5000,
  maxRetries: 3,
};

// File signature validation functions
function isValidAvif(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return buffer.subarray(4, 12).toString('ascii') === 'ftypavif';
}

function isValidWebp(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isValidPng(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return buffer.subarray(0, 8).equals(pngSignature);
}

function isValidJpeg(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isValidGif(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  const gif87a = buffer.subarray(0, 6).toString('ascii') === 'GIF87a';
  const gif89a = buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  return gif87a || gif89a;
}

function detectMimeType(filePath: string, buffer: Buffer): MimeDetectionResult {
  const ext = filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'avif':
      return {
        detectedMimeType: 'image/avif',
        isValid: isValidAvif(buffer),
        errorMessage: !isValidAvif(buffer)
          ? 'Invalid AVIF file signature'
          : undefined,
      };
    case 'webp':
      return {
        detectedMimeType: 'image/webp',
        isValid: isValidWebp(buffer),
        errorMessage: !isValidWebp(buffer)
          ? 'Invalid WebP file signature'
          : undefined,
      };
    case 'png':
      return {
        detectedMimeType: 'image/png',
        isValid: isValidPng(buffer),
        errorMessage: !isValidPng(buffer)
          ? 'Invalid PNG file signature'
          : undefined,
      };
    case 'jpg':
    case 'jpeg':
      return {
        detectedMimeType: 'image/jpeg',
        isValid: isValidJpeg(buffer),
        errorMessage: !isValidJpeg(buffer)
          ? 'Invalid JPEG file signature'
          : undefined,
      };
    case 'gif':
      return {
        detectedMimeType: 'image/gif',
        isValid: isValidGif(buffer),
        errorMessage: !isValidGif(buffer)
          ? 'Invalid GIF file signature'
          : undefined,
      };
    default:
      return {
        detectedMimeType: 'application/octet-stream',
        isValid: true,
        errorMessage: undefined,
      };
  }
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (!existsSync(dirPath)) {
      throw error;
    }
  }
}

async function delay(ms: number, attempt: number = 0): Promise<void> {
  const backoffMs = ms * Math.pow(1.5, attempt);
  return new Promise((resolve) => setTimeout(resolve, backoffMs));
}

async function withRateLimit<T>(
  operation: () => Promise<T>,
  operationName: string,
  retryCount: number = 0
): Promise<T> {
  try {
    stats.apiCalls++;
    return await operation();
  } catch (error: unknown) {
    const apiError = error as { status?: number; message?: string };
    const isRateLimit =
      apiError?.status === 429 ||
      apiError?.message?.includes('rate limit') ||
      apiError?.message?.includes('too many requests');

    if (isRateLimit && retryCount < RATE_LIMIT.maxRetries) {
      console.log(
        `  ⏳ Rate limited, retrying ${operationName} in ${RATE_LIMIT.retryDelay}ms... (attempt ${retryCount + 1})`
      );
      await delay(RATE_LIMIT.retryDelay, retryCount);
      return withRateLimit(operation, operationName, retryCount + 1);
    }

    throw error;
  }
}

class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        this.permits--;
        next();
      }
    }
  }
}

const downloadSemaphore = new Semaphore(RATE_LIMIT.maxConcurrent);

// Simplified function to get all files using bucket-wide search
async function getAllFiles(): Promise<string[]> {
  console.log('Getting all files from bucket...');

  const { data: files, error } = await withRateLimit(
    () =>
      remoteSupabase.storage.from(bucketName).list('', {
        limit: 10000, // Large limit to get all files
        sortBy: { column: 'name', order: 'asc' },
      }),
    'listing all bucket files'
  );

  if (error) {
    console.error('Error listing files:', error);
    throw error;
  }

  if (!files) {
    console.log('No files found in bucket');
    return [];
  }

  // Filter to only get actual files (not folders) and build full paths
  const allFiles: string[] = [];

  for (const file of files) {
    if (file.id !== null) {
      // Only actual files, not folders
      allFiles.push(file.name);
    }
  }

  // If we have folders, we'll need to recursively get their contents
  const folders = files.filter(
    (item): item is StorageFileItem => item.id === null
  );

  for (const folder of folders) {
    const folderFiles = await getFolderFiles(folder.name);
    allFiles.push(...folderFiles);
  }

  return allFiles;
}

// Helper function to get files from a specific folder
async function getFolderFiles(folderPath: string): Promise<string[]> {
  const { data: items, error } = await withRateLimit(
    () =>
      remoteSupabase.storage.from(bucketName).list(folderPath, {
        limit: 10000,
        sortBy: { column: 'name', order: 'asc' },
      }),
    `listing folder ${folderPath}`
  );

  if (error) {
    console.error(`Error listing files in ${folderPath}:`, error);
    return [];
  }

  if (!items) {
    return [];
  }

  const files: string[] = [];

  for (const item of items) {
    const fullPath = `${folderPath}/${item.name}`;

    if (item.id !== null) {
      // It's a file
      files.push(fullPath);
    } else {
      // It's a folder, recurse into it
      const subFiles = await getFolderFiles(fullPath);
      files.push(...subFiles);
    }
  }

  return files;
}

async function downloadContentImages(): Promise<void> {
  const startTime = Date.now();

  try {
    console.log('Starting content images download...');
    console.log(`Download path: ${localDownloadPath}`);
    console.log(
      `Rate limiting: ${RATE_LIMIT.maxConcurrent} concurrent downloads`
    );

    await ensureDirectoryExists(localDownloadPath);

    // Get all files at once
    console.log('\n=== Getting all files from bucket ===');
    const allFiles = await getAllFiles();

    stats.totalFiles = allFiles.length;
    console.log(`\n📁 Found ${allFiles.length} total files`);
    console.log(`🔗 Used ${stats.apiCalls} API calls for listing`);

    if (allFiles.length === 0) {
      console.log('No files to download.');
      return;
    }

    // Download files in batches
    console.log('\n=== Starting downloads ===');
    const batchSize = RATE_LIMIT.maxConcurrent;
    const totalBatches = Math.ceil(allFiles.length / batchSize);

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      console.log(
        `\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`
      );

      await Promise.all(batch.map(async (filePath) => downloadFile(filePath)));

      // Short delay between batches
      if (i + batchSize < allFiles.length) {
        console.log(
          `  ⏳ Batch complete, waiting ${RATE_LIMIT.delayBetweenBatches}ms...`
        );
        await delay(RATE_LIMIT.delayBetweenBatches);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n=== Download Complete ===');
    console.log(`Total time: ${duration} seconds`);
    console.log(`Total API calls made: ${stats.apiCalls}`);
    console.log(
      `Average API calls per second: ${(stats.apiCalls / parseFloat(duration)).toFixed(1)}`
    );
    console.log(`Files downloaded: ${stats.downloadedFiles}`);
    console.log(`Files skipped (already exist): ${stats.skippedFiles}`);
    console.log(`Files with errors: ${stats.errorFiles}`);
    console.log(`Invalid files detected: ${stats.invalidFiles}`);

    if (Object.keys(stats.mimeTypeBreakdown).length > 0) {
      console.log('\n=== MIME Type Breakdown ===');
      Object.entries(stats.mimeTypeBreakdown)
        .sort(([, a], [, b]) => b - a)
        .forEach(([mimeType, count]) => {
          console.log(`${mimeType}: ${count} files`);
        });
    }
  } catch (error) {
    console.error('Download failed:', error);
    process.exit(1);
  } finally {
    console.log('\nCleaning up and exiting...');
    process.exit(0);
  }
}

async function downloadFile(filePath: string): Promise<void> {
  await downloadSemaphore.acquire();

  try {
    const localFilePath = join(localDownloadPath, filePath);

    if (existsSync(localFilePath)) {
      console.log(`    ⏭️  Skipping ${filePath} - already exists locally`);
      stats.skippedFiles++;
      return;
    }

    const fileDir = dirname(localFilePath);
    await ensureDirectoryExists(fileDir);

    const { data: fileData, error: downloadError } = await withRateLimit(
      () => remoteSupabase.storage.from(bucketName).download(filePath),
      `downloading ${filePath}`
    );

    if (downloadError) {
      console.error(`    ❌ Error downloading ${filePath}:`, downloadError);
      stats.errorFiles++;
      return;
    }

    if (!fileData) {
      console.error(`    ❌ No data received for ${filePath}`);
      stats.errorFiles++;
      return;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const mimeResult = detectMimeType(filePath, buffer);

    if (!mimeResult.isValid) {
      console.error(
        `    ❌ Invalid file: ${filePath} - ${mimeResult.errorMessage}`
      );
      stats.invalidFiles++;
      return;
    }

    stats.mimeTypeBreakdown[mimeResult.detectedMimeType] =
      (stats.mimeTypeBreakdown[mimeResult.detectedMimeType] || 0) + 1;

    await writeFile(localFilePath, buffer);

    const fileSize = formatFileSize(buffer.length);
    console.log(
      `    ✅ Downloaded: ${filePath} (${mimeResult.detectedMimeType}, ${fileSize})`
    );
    stats.downloadedFiles++;
  } catch (error) {
    console.error(`    ❌ Error downloading ${filePath}:`, error);
    stats.errorFiles++;
  } finally {
    downloadSemaphore.release();
  }
}

// Process signal handlers
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT. Gracefully shutting down...');
  console.log('Current stats:');
  console.log(`  API calls made: ${stats.apiCalls}`);
  console.log(`  Downloaded: ${stats.downloadedFiles}`);
  console.log(`  Skipped: ${stats.skippedFiles}`);
  console.log(`  Errors: ${stats.errorFiles}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM. Gracefully shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the download
downloadContentImages().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
