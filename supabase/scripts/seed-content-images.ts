import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// Remote Supabase configuration
const remoteUrl = 'https://blrvnfwxtzzbofsdrvwv.supabase.co';
const remoteKey = 'sb_secret_KbOPFiPjUeHUVd0jPTV1Kg_Rndl23de';

const bucketName = 'content-images';
const localDownloadPath = join(process.cwd(), 'supabase', 'content-images');

const remoteSupabase = createClient(remoteUrl, remoteKey);

interface DownloadStats {
  totalFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  errorFiles: number;
}

const stats: DownloadStats = {
  totalFiles: 0,
  downloadedFiles: 0,
  skippedFiles: 0,
  errorFiles: 0,
};

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory might already exist, check if it's actually an error
    if (!existsSync(dirPath)) {
      throw error;
    }
  }
}

async function downloadContentImages(): Promise<void> {
  try {
    console.log('Starting content images download...');
    console.log(`Download path: ${localDownloadPath}`);

    // Ensure the download directory exists
    await ensureDirectoryExists(localDownloadPath);

    // Download all files from remote bucket
    await downloadFolder();

    console.log('\n=== Download Complete ===');
    console.log(`Total files found: ${stats.totalFiles}`);
    console.log(`Files downloaded: ${stats.downloadedFiles}`);
    console.log(`Files skipped (already exist): ${stats.skippedFiles}`);
    console.log(`Files with errors: ${stats.errorFiles}`);
  } catch (error) {
    console.error('Download failed:', error);
  }
}

async function downloadFolder(folderPath: string = ''): Promise<void> {
  try {
    let offset = 0;
    const limit = 1000; // Maximum limit per request
    let hasMore = true;

    while (hasMore) {
      console.log(
        `\nFetching files from ${folderPath || 'root'} (offset: ${offset})`
      );

      const { data: files, error } = await remoteSupabase.storage
        .from(bucketName)
        .list(folderPath, {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        console.error(`Error listing files in ${folderPath}:`, error);
        return;
      }

      if (!files || files.length === 0) {
        hasMore = false;
        if (offset === 0) {
          console.log(`No files found in ${folderPath || 'root'}`);
        }
        break;
      }

      console.log(
        `Found ${files.length} items in ${folderPath || 'root'} (batch ${Math.floor(offset / limit) + 1})`
      );

      // Process files in parallel batches to speed up download
      const batchSize = 20; // Process 10 files at a time
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (file) => {
            const fullPath = folderPath
              ? `${folderPath}/${file.name}`
              : file.name;

            if (file.id === null) {
              // It's a folder, recurse into it
              console.log(`Processing folder: ${fullPath}`);
              await downloadFolder(fullPath);
            } else {
              // It's a file, download it
              stats.totalFiles++;
              await downloadFile(fullPath);
            }
          })
        );
      }

      // Check if we got fewer files than the limit, meaning we've reached the end
      if (files.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error(`Error processing folder ${folderPath}:`, error);
  }
}

async function downloadFile(filePath: string): Promise<void> {
  try {
    const localFilePath = join(localDownloadPath, filePath);

    // Check if file already exists locally
    if (existsSync(localFilePath)) {
      console.log(`  ⏭️  Skipping ${filePath} - already exists locally`);
      stats.skippedFiles++;
      return;
    }

    // Ensure the directory for this file exists
    const fileDir = dirname(localFilePath);
    await ensureDirectoryExists(fileDir);

    // Download from remote
    const { data: fileData, error: downloadError } =
      await remoteSupabase.storage.from(bucketName).download(filePath);

    if (downloadError) {
      console.error(`  ❌ Error downloading ${filePath}:`, downloadError);
      stats.errorFiles++;
      return;
    }

    if (!fileData) {
      console.error(`  ❌ No data received for ${filePath}`);
      stats.errorFiles++;
      return;
    }

    // Convert blob to buffer and write to file
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await writeFile(localFilePath, buffer);

    console.log(`  ✅ Downloaded: ${filePath}`);
    stats.downloadedFiles++;
  } catch (error) {
    console.error(`  ❌ Error downloading ${filePath}:`, error);
    stats.errorFiles++;
  }
}

// Run the download
downloadContentImages();
