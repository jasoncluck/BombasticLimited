import { task } from '@trigger.dev/sdk/v3';
import sharp from 'sharp';
import { Pool } from 'pg';
import {
  uploadObject,
  downloadObject,
  listObjects,
  deleteObjects,
} from '$lib/server/s3';
import {
  calculateDynamicCropDimensions,
  validateAndAdjustCropDimensions,
} from '$lib/utils/dynamic-crop-dimensions';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

const IMAGES_BUCKET = process.env.CONTENT_IMAGES_BUCKET!;

// This worker runs as a backend job (Trigger.dev), not inside a user
// request, so it talks to Neon directly over `pg` (bypassing the Data
// API/RLS as the database owner) rather than going through Cognito auth.
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

// Configuration constants
const PROCESSING_TIMEOUT = 25000;

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: 'videos' | 'playlists';
  record: {
    id: string;
    thumbnail_url?: string;
    image_properties?: PlaylistImageProperties;
  };
  old_record?: {
    thumbnail_url?: string;
    image_properties?: PlaylistImageProperties;
  };
  jobId?: string;
  timestamp: string;
}

interface ProcessingResult {
  processed: boolean;
  reason?: string;
  entityType?: string;
  entityId?: string;
  webpPath?: string;
  avifPath?: string;
  webpSize?: number;
  avifSize?: number;
  jobId?: string;
  skippedDuplicate?: boolean;
}

interface StoragePaths {
  webpPath: string;
  avifPath: string;
}

interface ProcessedImages {
  webp: Buffer;
  avif: Buffer;
}

// Generate storage paths for optimized images (WITH timestamp for versioning)
function generateStoragePaths(
  entityType: string,
  entityId: string,
  timestamp?: string
): StoragePaths {
  // Use provided timestamp or create a new one
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');

  if (entityType === 'video') {
    return {
      webpPath: `thumbnails/${entityId}/thumbnail-${entityId}-${ts}.webp`,
      avifPath: `thumbnails/${entityId}/thumbnail-${entityId}-${ts}.avif`,
    };
  } else if (entityType === 'playlist') {
    return {
      webpPath: `playlists/${entityId}/playlist-${entityId}-${ts}.webp`,
      avifPath: `playlists/${entityId}/playlist-${entityId}-${ts}.avif`,
    };
  } else {
    return {
      webpPath: `${entityType}s/${entityId}/${entityType}-${entityId}-${ts}.webp`,
      avifPath: `${entityType}s/${entityId}/${entityType}-${entityId}-${ts}.avif`,
    };
  }
}

// Download image from source URL
async function downloadImage(sourceUrl: string): Promise<Buffer> {
  // Check if it's a Supabase Storage path
  if (
    sourceUrl.startsWith('playlists/') ||
    sourceUrl.startsWith('thumbnails/')
  ) {
    return downloadObject(IMAGES_BUCKET, sourceUrl);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Bombastic Image Processor/1.0',
        Accept: 'image/*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Get playlist crop properties
async function getPlaylistCropProperties(
  playlistId: string,
  imageWidth: number,
  imageHeight: number
): Promise<PlaylistImageProperties> {
  // Get playlist image_properties from database
  let imageProperties: PlaylistImageProperties | null = null;
  try {
    const { rows } = await pool.query<{
      image_properties: PlaylistImageProperties | null;
    }>('SELECT image_properties FROM playlists WHERE id = $1', [playlistId]);
    imageProperties = rows[0]?.image_properties ?? null;
  } catch (error) {
    console.warn(`Failed to get playlist crop properties: ${error}`);
  }

  // Check if we have custom crop properties
  let customProperties: PlaylistImageProperties | null = null;
  const imageArea = imageWidth * imageHeight;
  const isSmallThumbnail = imageArea <= 100000;

  if (imageProperties && !isSmallThumbnail) {
    const props = imageProperties;
    if (
      typeof props.x === 'number' &&
      typeof props.y === 'number' &&
      typeof props.width === 'number' &&
      typeof props.height === 'number'
    ) {
      customProperties = props;
    }
  }

  // Calculate dynamic crop properties
  const cropProperties = calculateDynamicCropDimensions(
    imageWidth,
    imageHeight,
    true, // Prefer square crop
    customProperties
  );

  return cropProperties;
}

// Process image formats with compression
async function processImageFormats(
  buffer: Buffer,
  entityType?: string,
  playlistId?: string,
  sourceUrl?: string
): Promise<ProcessedImages> {
  const sharpInstance = sharp(buffer, {
    failOnError: false,
    density: 300,
    limitInputPixels: 268402689, // ~16MP limit to prevent OOM
  });

  // Get metadata
  const metadata = await sharpInstance.metadata();
  const sourceWidth = metadata.width || 1920;
  const sourceHeight = metadata.height || 1080;

  try {
    let pipeline = sharpInstance;
    let finalOutputSize = { width: sourceWidth, height: sourceHeight };

    if (entityType === 'playlist' && playlistId && sourceUrl) {
      // Apply cropping for playlists
      const cropProps = await getPlaylistCropProperties(
        playlistId,
        sourceWidth,
        sourceHeight
      );

      const imageType =
        sourceWidth === 1280 && sourceHeight === 720 ? 'maxres' : 'standard';
      const validatedCropProps = validateAndAdjustCropDimensions(
        cropProps,
        sourceWidth,
        sourceHeight,
        imageType,
        null
      );

      pipeline = pipeline.extract({
        left: validatedCropProps.x,
        top: validatedCropProps.y,
        width: validatedCropProps.width,
        height: validatedCropProps.height,
      });

      // Determine output size based on crop
      const cropSize = Math.min(
        validatedCropProps.width,
        validatedCropProps.height
      );
      let outputSize: number;

      if (cropSize <= 180) {
        outputSize = 256;
      } else if (cropSize <= 360) {
        outputSize = 512;
      } else {
        outputSize = 768;
      }

      finalOutputSize = { width: outputSize, height: outputSize };

      pipeline = pipeline
        .resize(outputSize, outputSize, {
          fit: 'cover',
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .sharpen({
          sigma: 0.8,
          m1: 1.0,
          m2: 1.8,
          x1: 2.0,
          y2: 8.0,
          y3: 15.0,
        });
    } else {
      // For videos, apply smart resizing
      const maxDimension = Math.max(sourceWidth, sourceHeight);
      let targetSize: number;

      if (maxDimension > 1920) {
        targetSize = 1920;
      } else if (maxDimension > 1280) {
        targetSize = 1280;
      } else if (maxDimension > 640) {
        targetSize = 640;
      } else {
        targetSize = maxDimension;
      }

      if (targetSize < maxDimension) {
        const aspectRatio = sourceWidth / sourceHeight;
        const newWidth =
          aspectRatio >= 1 ? targetSize : Math.round(targetSize * aspectRatio);
        const newHeight =
          aspectRatio >= 1 ? Math.round(targetSize / aspectRatio) : targetSize;

        finalOutputSize = { width: newWidth, height: newHeight };

        pipeline = pipeline.resize(newWidth, newHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        });
      }
    }

    // Apply color space conversion
    pipeline = pipeline.toColourspace('srgb');

    const pixelCount = finalOutputSize.width * finalOutputSize.height;
    const isLargeImage = pixelCount > 300000;

    // Compression settings
    const webpQuality = isLargeImage ? 65 : 75;
    const avifQuality = isLargeImage ? 55 : 65;

    const result: ProcessedImages = {
      webp: Buffer.alloc(0),
      avif: Buffer.alloc(0),
    };

    // Generate WebP
    result.webp = await pipeline
      .clone()
      .webp({
        quality: webpQuality,
        effort: 6,
        lossless: false,
        nearLossless: false,
        smartSubsample: true,
        preset: 'photo',
        alphaQuality: 80,
      })
      .toBuffer();

    // Generate AVIF
    result.avif = await pipeline
      .clone()
      .avif({
        quality: avifQuality,
        effort: 9,
        lossless: false,
        chromaSubsampling: '4:2:0',
      })
      .toBuffer();

    return result;
  } finally {
    // Cleanup Sharp instance
    if (sharpInstance) {
      sharpInstance.destroy();
    }
    // Force garbage collection hint
    if (global.gc) {
      global.gc();
    }
  }
}

// Upload processed images to S3
async function uploadToStorage(
  webpBuffer: Buffer,
  avifBuffer: Buffer,
  webpPath: string,
  avifPath: string
): Promise<StoragePaths> {
  await uploadObject({
    bucket: IMAGES_BUCKET,
    key: webpPath,
    body: webpBuffer,
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
  });

  await uploadObject({
    bucket: IMAGES_BUCKET,
    key: avifPath,
    body: avifBuffer,
    contentType: 'image/avif',
    cacheControl: 'public, max-age=31536000, immutable',
  });

  return { webpPath, avifPath };
}

// Comprehensive cleanup of all existing optimized images
async function deleteExistingOptimizedImages(
  entityType: string,
  entityId: string
): Promise<void> {
  try {
    console.log(`Starting cleanup for ${entityType} ${entityId}`);

    // Get all files in the entity's folder
    const folderPrefix =
      entityType === 'video'
        ? `thumbnails/${entityId}/`
        : `playlists/${entityId}/`;

    let existingKeys: string[];
    try {
      existingKeys = await listObjects(IMAGES_BUCKET, folderPrefix);
    } catch (error) {
      console.warn(`Failed to list existing files: ${error}`);
      return;
    }

    if (existingKeys.length === 0) {
      console.log(`No existing files found in ${folderPrefix}`);
      return;
    }

    // Filter for image files (webp, avif, and any other formats)
    const filesToDelete = existingKeys.filter((key) => {
      const name = key.toLowerCase();
      return (
        name.endsWith('.webp') ||
        name.endsWith('.avif') ||
        name.endsWith('.jpg') ||
        name.endsWith('.png')
      );
    });

    if (filesToDelete.length === 0) {
      console.log(`No image files found to delete in ${folderPrefix}`);
      return;
    }

    console.log(`Deleting ${filesToDelete.length} files:`, filesToDelete);

    try {
      await deleteObjects(IMAGES_BUCKET, filesToDelete);
      console.log(`Successfully deleted ${filesToDelete.length} files`);
    } catch (error) {
      console.warn(`Failed to delete some files: ${error}`);
    }

    // Also clean up database references for playlists
    try {
      if (entityType === 'playlist') {
        await pool.query(
          'UPDATE playlists SET image_webp_url = NULL, image_avif_url = NULL WHERE id = $1',
          [entityId]
        );
      } else if (entityType === 'video') {
        await pool.query(
          'UPDATE videos SET thumbnail_webp_url = NULL, thumbnail_avif_url = NULL WHERE id = $1',
          [entityId]
        );
      }
    } catch (error) {
      console.warn(`Failed to clear database references: ${error}`);
    }
  } catch (error) {
    console.error(`Error during cleanup: ${error}`);
    // Don't throw here - we want to continue with processing even if cleanup fails
  }
}

// Update database with processed image URLs
async function updateEntityWithProcessedImages(
  entityType: string,
  entityId: string,
  webpPath: string,
  avifPath: string
): Promise<void> {
  try {
    if (entityType === 'playlist') {
      await pool.query(
        `UPDATE playlists SET image_webp_url = $1, image_avif_url = $2,
         image_processing_status = 'completed', image_processing_updated_at = NOW()
         WHERE id = $3`,
        [webpPath, avifPath, entityId]
      );
    } else if (entityType === 'video') {
      await pool.query(
        `UPDATE videos SET thumbnail_webp_url = $1, thumbnail_avif_url = $2,
         image_processing_status = 'completed', image_processing_updated_at = NOW()
         WHERE id = $3`,
        [webpPath, avifPath, entityId]
      );
    }
  } catch (error) {
    throw new Error(`Failed to update ${entityType}: ${error}`);
  }
}

async function completeImageProcessingJob(
  jobId: string,
  webpPath?: string,
  avifPath?: string
): Promise<boolean> {
  const { rows } = await pool.query<{ complete_image_processing_job: boolean }>(
    'SELECT public.complete_image_processing_job(job_id := $1, webp_path := $2, avif_path := $3) AS complete_image_processing_job',
    [jobId, webpPath ?? null, avifPath ?? null]
  );
  return rows[0]?.complete_image_processing_job ?? false;
}

async function failImageProcessingJob(
  jobId: string,
  errorMsg: string
): Promise<boolean> {
  const { rows } = await pool.query<{ fail_image_processing_job: boolean }>(
    'SELECT public.fail_image_processing_job($1, $2) AS fail_image_processing_job',
    [jobId, errorMsg]
  );
  return rows[0]?.fail_image_processing_job ?? false;
}

// Main image processing task
export const processImageWebhook = task({
  id: 'process-image-webhook',
  maxDuration: 10 * 60, // 10 minutes
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: false,
  },
  run: async (payload: WebhookPayload): Promise<ProcessingResult> => {
    const { type, table, record, old_record, jobId, timestamp } = payload;
    const entityType = table === 'playlists' ? 'playlist' : 'video';

    console.log(`Starting image processing for ${entityType} ${record.id}`, {
      type,
      table,
      jobId,
      timestamp,
      thumbnailUrl: record.thumbnail_url,
    });

    // Early validation
    if (!record.thumbnail_url) {
      console.log(
        `No thumbnail URL for ${entityType} ${record.id}, completing job`
      );
      if (jobId) {
        try {
          const completionResult = await completeImageProcessingJob(jobId);
          console.log('Job completion result:', { completionResult });
        } catch (error) {
          console.warn(`Failed to complete job ${jobId}:`, error);
        }
      }
      return { processed: false, reason: 'No thumbnail URL provided' };
    }

    // Determine if we need to process
    let shouldProcess = false;
    let sourceUrl: string | null = null;

    if (type === 'INSERT') {
      if (record.thumbnail_url) {
        shouldProcess = true;
        sourceUrl = record.thumbnail_url;
      }
    } else if (type === 'UPDATE') {
      const thumbnailChanged =
        record.thumbnail_url !== old_record?.thumbnail_url;
      const imagePropertiesChanged =
        table === 'playlists' &&
        JSON.stringify(record.image_properties) !==
          JSON.stringify(old_record?.image_properties);

      console.log(`UPDATE: ${entityType} ${record.id}`, {
        thumbnailChanged,
        imagePropertiesChanged,
        oldThumbnail: old_record?.thumbnail_url,
        newThumbnail: record.thumbnail_url,
      });

      if (thumbnailChanged || imagePropertiesChanged) {
        shouldProcess = true;
        sourceUrl = record.thumbnail_url || null;
      }
    }

    if (!shouldProcess || !sourceUrl) {
      console.log(`No processing needed for ${entityType} ${record.id}`);
      if (jobId) {
        try {
          const completionResult = await completeImageProcessingJob(jobId);
          console.log('Job completion result:', { completionResult });
        } catch (error) {
          console.warn(`Failed to complete job ${jobId}:`, error);
        }
      }
      return { processed: false, reason: 'No changes requiring processing' };
    }

    try {
      console.log(
        `Processing ${entityType} ${record.id} with source: ${sourceUrl}`
      );

      // CRITICAL: Delete ALL existing optimized images first
      console.log(
        `Deleting existing optimized images for ${entityType} ${record.id}`
      );
      await deleteExistingOptimizedImages(entityType, record.id);

      // Download source image
      console.log(`Downloading image from: ${sourceUrl}`);
      const imageBuffer = await downloadImage(sourceUrl);
      console.log(`Downloaded ${imageBuffer.length} bytes`);

      // Process image
      console.log(`Processing image for ${entityType} ${record.id}`);
      const { webp: webpBuffer, avif: avifBuffer } = await processImageFormats(
        imageBuffer,
        entityType,
        entityType === 'playlist' ? record.id : undefined,
        sourceUrl
      );
      console.log(
        `Processed images: WebP ${webpBuffer.length} bytes, AVIF ${avifBuffer.length} bytes`
      );

      // Generate storage paths with timestamp for versioning
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        record.id,
        timestamp // Use the webhook timestamp for consistency
      );

      // Upload to storage with unique timestamped filenames
      console.log(`Uploading optimized images for ${entityType} ${record.id}`);
      await uploadToStorage(webpBuffer, avifBuffer, webpPath, avifPath);
      console.log(`Uploaded images to storage:`, { webpPath, avifPath });

      // Complete job or update database
      if (jobId) {
        try {
          console.log(`Completing job ${jobId} with paths:`, {
            webpPath,
            avifPath,
          });
          const completionResult = await completeImageProcessingJob(
            jobId,
            webpPath,
            avifPath
          );

          console.log('Job completion result:', { completionResult });

          if (!completionResult) {
            throw new Error(
              'Job completion returned false - job may not exist or update failed'
            );
          }

          console.log(`Successfully completed job ${jobId}`);
        } catch (error) {
          console.error(`Failed to complete job ${jobId}:`, error);
          console.log('Attempting fallback database update...');
          await updateEntityWithProcessedImages(
            entityType,
            record.id,
            webpPath,
            avifPath
          );
          console.log('Fallback database update completed');
        }
      } else {
        console.log(`No job ID, updating ${entityType} ${record.id} directly`);
        await updateEntityWithProcessedImages(
          entityType,
          record.id,
          webpPath,
          avifPath
        );
        console.log('Direct database update completed');
      }

      console.log(`Successfully processed ${entityType} ${record.id}`);

      return {
        processed: true,
        entityType,
        entityId: record.id,
        webpPath,
        avifPath,
        webpSize: Math.round(webpBuffer.length / 1024),
        avifSize: Math.round(avifBuffer.length / 1024),
        jobId,
      };
    } catch (error) {
      console.error(`Failed to process ${entityType} ${record.id}:`, error);

      if (jobId) {
        try {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.log(`Failing job ${jobId} with error: ${errorMessage}`);
          const failResult = await failImageProcessingJob(jobId, errorMessage);
          console.log('Job failure result:', { failResult });
        } catch (failError) {
          console.error(`Failed to mark job ${jobId} as failed:`, failError);
        }
      }

      throw error;
    }
  },
});
