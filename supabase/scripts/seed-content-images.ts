import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

import dotenv from 'dotenv';

dotenv.config();

// Production Supabase configuration to pull images from
const remoteUrl = process.env.PROD_SUPABASE_URL;
const remoteKey = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;

const bucketName = 'content-images';
const localDownloadPath = join(process.cwd(), '../content-images');

if (!remoteUrl || !remoteKey) {
  throw new Error('Missing remote environment variables');
}

const remoteSupabase = createClient(remoteUrl, remoteKey);

interface DownloadStats {
  totalFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  invalidFiles: number;
  mimeTypeBreakdown: Record<string, number>;
  apiCalls: number;
  foldersProcessed: number;
  totalFolders: number;
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
  discoveryBatchSize: number;
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
  foldersProcessed: 0,
  totalFolders: 0,
};

// More conservative rate limiting to prevent API exhaustion
const RATE_LIMIT: RateLimitConfig = {
  maxConcurrent: 25, // Reduced from 50 to be more conservative
  delayBetweenBatches: 200, // Slightly increased
  retryDelay: 2000,
  maxRetries: 5, // Increased retries
  discoveryBatchSize: 500, // Smaller batches for discovery
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
  const backoffMs = ms * Math.pow(1.2, attempt); // Gentler backoff
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
      apiError?.message?.includes('too many requests') ||
      apiError?.message?.includes('timeout');

    if (isRateLimit && retryCount < RATE_LIMIT.maxRetries) {
      const delayMs = RATE_LIMIT.retryDelay * Math.pow(2, retryCount); // Exponential backoff
      console.log(
        `  ⏳ Rate limited/timeout, retrying ${operationName} in ${delayMs}ms... (attempt ${retryCount + 1}/${RATE_LIMIT.maxRetries})`
      );
      await delay(delayMs);
      return withRateLimit(operation, operationName, retryCount + 1);
    }

    // Log the error for debugging but don't always throw
    console.error(`❌ Operation failed: ${operationName}`, {
      status: apiError?.status,
      message: apiError?.message,
      retryCount,
    });

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

// Robust file discovery with comprehensive error handling
async function getAllFilesRobust(): Promise<string[]> {
  console.log('🚀 Starting comprehensive file discovery...');

  const allFiles: string[] = [];
  const processedPaths = new Set<string>();
  const pendingPaths: string[] = [''];
  let totalFoldersFound = 0;

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.shift()!;

    if (processedPaths.has(currentPath)) {
      continue;
    }
    processedPaths.add(currentPath);
    stats.foldersProcessed++;

    try {
      console.log(
        `📂 Scanning folder ${stats.foldersProcessed}: ${currentPath || 'root'} (${pendingPaths.length} folders remaining)`
      );

      // Use pagination to handle large folders
      let pageToken: string | undefined;
      let filesInThisFolder = 0;
      let foldersInThisFolder = 0;

      do {
        const listParams: any = {
          limit: RATE_LIMIT.discoveryBatchSize,
          sortBy: { column: 'name', order: 'asc' },
        };

        if (pageToken) {
          listParams.offset = pageToken;
        }

        const { data: items, error } = await withRateLimit(
          () =>
            remoteSupabase.storage
              .from(bucketName)
              .list(currentPath, listParams),
          `listing ${currentPath || 'root'} (page ${pageToken || 'first'})`
        );

        if (error) {
          console.error(`❌ Error listing ${currentPath}:`, error);
          break; // Skip this folder but continue with others
        }

        if (!items || items.length === 0) {
          break; // No more items
        }

        for (const item of items) {
          const fullPath = currentPath
            ? `${currentPath}/${item.name}`
            : item.name;

          if (item.id !== null) {
            // It's a file
            allFiles.push(fullPath);
            filesInThisFolder++;
          } else {
            // It's a folder
            if (
              !processedPaths.has(fullPath) &&
              !pendingPaths.includes(fullPath)
            ) {
              pendingPaths.push(fullPath);
              foldersInThisFolder++;
              totalFoldersFound++;
            }
          }
        }

        // Check if we got a full batch (indicating there might be more)
        if (items.length < RATE_LIMIT.discoveryBatchSize) {
          break; // This was the last page
        }

        // Set up for next page (simple offset-based pagination)
        pageToken = (
          parseInt(pageToken || '0') + RATE_LIMIT.discoveryBatchSize
        ).toString();
      } while (true);

      console.log(
        `  📁 Found ${foldersInThisFolder} subfolders, ${filesInThisFolder} files. Total files so far: ${allFiles.length}`
      );

      // Add a small delay between folder scans to prevent overwhelming the API
      if (pendingPaths.length > 0) {
        await delay(50); // Small delay between folders
      }
    } catch (error) {
      console.error(
        `❌ Critical error processing folder ${currentPath}:`,
        error
      );
      // Continue with next folder instead of failing entirely
      continue;
    }
  }

  stats.totalFiles = allFiles.length;
  stats.totalFolders = totalFoldersFound;

  console.log(`✅ Discovery complete!`);
  console.log(`  📁 Total folders processed: ${stats.foldersProcessed}`);
  console.log(`  📄 Total files found: ${allFiles.length}`);
  console.log(`  🔗 API calls used for discovery: ${stats.apiCalls}`);

  return allFiles;
}

async function downloadContentImages(): Promise<void> {
  const startTime = Date.now();
  let lastProgressTime = startTime;

  try {
    console.log('Starting robust content images download...');
    console.log(`Download path: ${localDownloadPath}`);
    console.log(
      `Rate limiting: ${RATE_LIMIT.maxConcurrent} concurrent downloads`
    );

    await ensureDirectoryExists(localDownloadPath);

    // Get all files first with robust error handling
    console.log('\n=== Starting comprehensive file discovery ===');
    const allFiles = await getAllFilesRobust();

    if (allFiles.length === 0) {
      console.log('No files to download.');
      return;
    }

    // Download files in batches with progress reporting
    console.log('\n=== Starting downloads ===');
    const batchSize = RATE_LIMIT.maxConcurrent;
    const totalBatches = Math.ceil(allFiles.length / batchSize);

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const now = Date.now();

      // Progress reporting every 30 seconds
      if (now - lastProgressTime > 30000 || batchNumber === 1) {
        const progress = ((i / allFiles.length) * 100).toFixed(1);
        const elapsed = ((now - startTime) / 1000).toFixed(0);
        const rate = stats.downloadedFiles / (parseInt(elapsed) || 1);

        console.log(`\n📊 Progress Report:`);
        console.log(
          `  📦 Batch ${batchNumber}/${totalBatches} (${progress}% complete)`
        );
        console.log(
          `  ⏱️  Elapsed: ${elapsed}s | Rate: ${rate.toFixed(1)} files/sec`
        );
        console.log(
          `  ✅ Downloaded: ${stats.downloadedFiles} | ⏭️  Skipped: ${stats.skippedFiles} | ❌ Errors: ${stats.errorFiles}`
        );
        console.log(`  🔗 API calls: ${stats.apiCalls}`);

        lastProgressTime = now;
      }

      console.log(
        `📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`
      );

      await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            await downloadFile(filePath);
          } catch (error) {
            console.error(`❌ Failed to download ${filePath}:`, error);
            stats.errorFiles++;
          }
        })
      );

      // Delay between batches to prevent overwhelming the server
      if (
        i + batchSize < allFiles.length &&
        RATE_LIMIT.delayBetweenBatches > 0
      ) {
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
    console.log(`Files processed: ${stats.totalFiles}`);
    console.log(`Files downloaded: ${stats.downloadedFiles}`);
    console.log(`Files skipped (already exist): ${stats.skippedFiles}`);
    console.log(`Files with errors: ${stats.errorFiles}`);
    console.log(`Invalid files detected: ${stats.invalidFiles}`);
    console.log(
      `Folders processed: ${stats.foldersProcessed}/${stats.totalFolders}`
    );

    // Verify we got everything
    if (
      stats.downloadedFiles +
        stats.skippedFiles +
        stats.errorFiles +
        stats.invalidFiles !==
      stats.totalFiles
    ) {
      console.warn(`⚠️  Warning: File count mismatch detected!`);
      console.warn(`  Expected: ${stats.totalFiles}`);
      console.warn(
        `  Processed: ${stats.downloadedFiles + stats.skippedFiles + stats.errorFiles + stats.invalidFiles}`
      );
    }

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
    console.log('\nPartial results:');
    console.log(`Files downloaded so far: ${stats.downloadedFiles}`);
    console.log(`Files skipped so far: ${stats.skippedFiles}`);
    console.log(`Files with errors so far: ${stats.errorFiles}`);
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
      // Only log occasionally to reduce noise
      if (stats.skippedFiles % 100 === 0) {
        console.log(
          `    ⏭️  Skipping ${filePath} - already exists locally (${stats.skippedFiles + 1} total skipped)`
        );
      }
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

    // Only log downloads occasionally to reduce noise
    if (stats.downloadedFiles % 50 === 0) {
      console.log(
        `    ✅ Downloaded: ${filePath} (${mimeResult.detectedMimeType}, ${fileSize}) - ${stats.downloadedFiles + 1} total`
      );
    }

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
  console.log(
    `  Folders processed: ${stats.foldersProcessed}/${stats.totalFolders}`
  );
  console.log(`  Files found: ${stats.totalFiles}`);
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
  console.log('Current stats before crash:');
  console.log(`  Downloaded: ${stats.downloadedFiles}`);
  console.log(`  Skipped: ${stats.skippedFiles}`);
  console.log(`  Errors: ${stats.errorFiles}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('Current stats before crash:');
  console.log(`  Downloaded: ${stats.downloadedFiles}`);
  console.log(`  Skipped: ${stats.skippedFiles}`);
  console.log(`  Errors: ${stats.errorFiles}`);
  process.exit(1);
});

// Run the download
downloadContentImages().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
