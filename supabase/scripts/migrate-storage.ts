import { createClient } from '@supabase/supabase-js';

// Remote Supabase configuration
const remoteUrl = 'https://blrvnfwxtzzbofsdrvwv.supabase.co';
const remoteKey = 'sb_secret_KbOPFiPjUeHUVd0jPTV1Kg_Rndl23de';

// Local Supabase configuration (default local setup)
const localUrl = 'http://127.0.0.1:54321';
const localKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const bucketName = 'content-images';

const remoteSupabase = createClient(remoteUrl, remoteKey);
const localSupabase = createClient(localUrl, localKey);

interface FileItem {
  name: string;
  id: string | null;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: Record<string, unknown>;
}

interface MigrationStats {
  totalFiles: number;
  migratedFiles: number;
  skippedFiles: number;
  errorFiles: number;
}

const stats: MigrationStats = {
  totalFiles: 0,
  migratedFiles: 0,
  skippedFiles: 0,
  errorFiles: 0,
};

async function migrateStorageBucket(): Promise<void> {
  try {
    console.log('Starting storage migration...');

    // First, ensure the bucket exists in local storage
    const { data: existingBuckets } = await localSupabase.storage.listBuckets();
    const bucketExists = existingBuckets?.some(
      (bucket) => bucket.name === bucketName
    );

    if (!bucketExists) {
      console.log(`Creating bucket: ${bucketName}`);
      const { error: createBucketError } =
        await localSupabase.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: [
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/avif',
          ],
          fileSizeLimit: 52428800, // 50MB
        });

      if (createBucketError) {
        console.error('Error creating bucket:', createBucketError);
        return;
      }
    }

    // Get all files from remote bucket with pagination
    await migrateFolder();

    console.log('\n=== Migration Complete ===');
    console.log(`Total files found: ${stats.totalFiles}`);
    console.log(`Files migrated: ${stats.migratedFiles}`);
    console.log(`Files skipped (already exist): ${stats.skippedFiles}`);
    console.log(`Files with errors: ${stats.errorFiles}`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

async function migrateFolder(folderPath: string = ''): Promise<void> {
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

      // Process files in parallel batches to speed up migration
      const batchSize = 10; // Process 10 files at a time
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
              await migrateFolder(fullPath);
            } else {
              // It's a file, migrate it
              stats.totalFiles++;
              await migrateFile(fullPath);
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

async function migrateFile(filePath: string): Promise<void> {
  try {
    // Check if file already exists in local storage
    const folderPath = filePath.includes('/')
      ? filePath.substring(0, filePath.lastIndexOf('/'))
      : '';
    const fileName = filePath.includes('/')
      ? filePath.substring(filePath.lastIndexOf('/') + 1)
      : filePath;

    const { data: existingFile } = await localSupabase.storage
      .from(bucketName)
      .list(folderPath, {
        search: fileName,
      });

    if (existingFile && existingFile.length > 0) {
      console.log(`  ⏭️  Skipping ${filePath} - already exists locally`);
      stats.skippedFiles++;
      return;
    }

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

    // Upload to local
    const { error: uploadError } = await localSupabase.storage
      .from(bucketName)
      .upload(filePath, fileData, {
        upsert: true,
      });

    if (uploadError) {
      console.error(`  ❌ Error uploading ${filePath}:`, uploadError);
      stats.errorFiles++;
      return;
    }

    console.log(`  ✅ Migrated: ${filePath}`);
    stats.migratedFiles++;
  } catch (error) {
    console.error(`  ❌ Error migrating ${filePath}:`, error);
    stats.errorFiles++;
  }
}

// Run the migration
migrateStorageBucket();
