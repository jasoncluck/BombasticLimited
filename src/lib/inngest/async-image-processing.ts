import { inngest } from './client';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { IMAGES_BUCKET } from '$lib/constants/images';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseServiceKey = SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Configuration
const STORAGE_BUCKET = IMAGES_BUCKET;
const MAX_RETRIES = 3;
const PROCESSING_TIMEOUT = 60000; // Increased timeout for quality processing

// Crop defaults
const PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS: PlaylistImageProperties = {
  x: 280,
  y: 0,
  height: 720,
  width: 720,
};

const PLAYLIST_IMAGE_CROP_DEFAULTS: PlaylistImageProperties = {
  x: 70, // (320-180)/2 = 70
  y: 0,
  height: 180,
  width: 180,
};

interface ProcessingResult {
  webpPath?: string;
  avifPath?: string;
  error?: string;
}

/**
 * Delete existing optimized images for an entity with logging
 */
async function deleteExistingOptimizedImages(
  entityType: string,
  entityId: string
): Promise<void> {
  const deleteStartTimestamp = new Date().toISOString();
  console.log(
    `🗑️ [${deleteStartTimestamp}] Starting deletion of existing optimized images for ${entityType} ${entityId}`
  );

  if (entityType === 'playlist') {
    // Get current image URLs from database
    const { data: playlist, error } = await supabase
      .from('playlists')
      .select('image_webp_url, image_avif_url')
      .eq('id', entityId)
      .single();

    if (error) {
      console.warn(
        `⚠️ [${new Date().toISOString()}] Failed to get existing playlist images for ${entityId}: ${error.message}`
      );
      return;
    }

    const filesToDelete = [];
    if (playlist?.image_webp_url) {
      filesToDelete.push(playlist.image_webp_url);
    }
    if (playlist?.image_avif_url) {
      filesToDelete.push(playlist.image_avif_url);
    }

    console.log(
      `📋 [${new Date().toISOString()}] Found ${filesToDelete.length} existing files to delete for playlist ${entityId}: ${filesToDelete.join(', ')}`
    );

    if (filesToDelete.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(filesToDelete);

      if (deleteError) {
        console.warn(
          `⚠️ [${new Date().toISOString()}] Failed to delete existing images for playlist ${entityId}: ${deleteError.message}`
        );
      } else {
        console.log(
          `✅ [${new Date().toISOString()}] Deleted ${filesToDelete.length} existing images for playlist ${entityId}`
        );
      }
    } else {
      console.log(
        `ℹ️ [${new Date().toISOString()}] No existing images to delete for playlist ${entityId}`
      );
    }
  } else {
    console.log(
      `ℹ️ [${new Date().toISOString()}] Deletion not implemented for entity type: ${entityType}`
    );
  }
}

/**
 * Generate storage paths for optimized images with detailed logging
 */
function generateStoragePaths(
  entityType: string,
  entityId: string,
  imageType: string,
  jobId?: string
): { webpPath: string; avifPath: string } {
  const timestamp = Date.now();
  const timestampStr = new Date(timestamp).toISOString();

  console.log(
    `📂 [${timestampStr}] Generating storage paths for ${entityType}/${entityId}/${imageType} (job: ${jobId}, timestamp: ${timestamp})`
  );

  if (entityType === 'playlist') {
    // Use playlists/{playlistId}/ structure
    const basePath = `playlists/${entityId}/playlist-${entityId}-${timestamp}`;
    const paths = {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };

    console.log(
      `📂 [${timestampStr}] Playlist paths generated - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
    );
    return paths;
  } else if (entityType === 'video') {
    // Keep existing video structure
    if (imageType === 'thumbnail') {
      const basePath = `thumbnails/${entityId}/thumbnail-${entityId}-${timestamp}`;
      const paths = {
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };

      console.log(
        `📂 [${timestampStr}] Video thumbnail paths generated - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
      );
      return paths;
    } else if (imageType === 'thumbnail_maxres') {
      const basePath = `thumbnails/${entityId}/thumbnail-maxres-${entityId}-${timestamp}`;
      const paths = {
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };

      console.log(
        `📂 [${timestampStr}] Video maxres paths generated - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
      );
      return paths;
    }
  }

  // Fallback
  const basePath = `${entityType}s/${entityId}/${entityType}-${entityId}-${timestamp}`;
  const paths = {
    webpPath: `${basePath}.webp`,
    avifPath: `${basePath}.avif`,
  };

  console.log(
    `📂 [${timestampStr}] Fallback paths generated - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
  );
  return paths;
}

/**
 * Check if we already have optimized images for this entity
 */
async function checkExistingOptimizedImages(
  entityType: string,
  entityId: string
): Promise<{ hasWebP: boolean; hasAVIF: boolean; shouldSkip: boolean }> {
  if (entityType === 'playlist') {
    const { data: playlist, error } = await supabase
      .from('playlists')
      .select('image_webp_url, image_avif_url, image_processing_status')
      .eq('id', entityId)
      .single();

    if (error) {
      console.warn(
        `Failed to check existing playlist images: ${error.message}`
      );
      return { hasWebP: false, hasAVIF: false, shouldSkip: false };
    }

    const hasWebP =
      playlist?.image_webp_url && playlist.image_webp_url.trim() !== '';
    const hasAVIF =
      playlist?.image_avif_url && playlist.image_avif_url.trim() !== '';

    // Never skip - we want to replace existing images with new versions
    const shouldSkip = false;

    return { hasWebP, hasAVIF, shouldSkip };
  }

  return { hasWebP: false, hasAVIF: false, shouldSkip: false };
}

/**
 * Download and validate image from source URL
 */
async function downloadImage(sourceUrl: string): Promise<Buffer> {
  // Check if it's a Supabase Storage path
  if (
    sourceUrl.startsWith('playlists/') ||
    sourceUrl.startsWith('thumbnails/')
  ) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(sourceUrl);

    if (error) {
      throw new Error(`Failed to download from storage: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Bombastic Image Processor/1.0',
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

/**
 * Get playlist crop properties from database or use defaults
 */
async function getPlaylistCropProperties(
  playlistId: string,
  sourceUrl: string
): Promise<PlaylistImageProperties> {
  // Get playlist image_properties
  const { data: playlist, error } = await supabase
    .from('playlists')
    .select('image_properties')
    .eq('id', playlistId)
    .single();

  if (error) {
    console.warn(`Failed to get playlist crop properties: ${error.message}`);
  }

  // If we have custom crop properties, use them
  if (playlist?.image_properties) {
    const props = playlist.image_properties as PlaylistImageProperties;
    // Validate the properties have required fields
    if (
      typeof props.x === 'number' &&
      typeof props.y === 'number' &&
      typeof props.width === 'number' &&
      typeof props.height === 'number'
    ) {
      return props;
    }
  }

  // Use defaults based on source URL resolution detection
  try {
    const imageBuffer = await downloadImage(sourceUrl);
    const metadata = await sharp(imageBuffer).metadata();

    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    // Detect if this is a maxres image (1280x720)
    if (imageWidth === 1280 && imageHeight === 720) {
      return PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS;
    }
    // Detect if this is a medium thumbnail (320x180)
    else if (imageWidth === 320 && imageHeight === 180) {
      return PLAYLIST_IMAGE_CROP_DEFAULTS;
    }
    // For other sizes, create a centered square crop
    else {
      const cropSize = Math.min(imageWidth, imageHeight);
      return {
        x: Math.round((imageWidth - cropSize) / 2),
        y: Math.round((imageHeight - cropSize) / 2),
        width: cropSize,
        height: cropSize,
      };
    }
  } catch (error) {
    console.warn(
      'Failed to detect image dimensions, using standard defaults:',
      error
    );
    return PLAYLIST_IMAGE_CROP_DEFAULTS;
  }
}

/**
 * **HIGH-QUALITY** image processing with advanced optimization
 */
async function processImageFormats(
  buffer: Buffer,
  entityType?: string,
  playlistId?: string,
  sourceUrl?: string
): Promise<{ webp: Buffer; avif: Buffer }> {
  console.log('🎨 Starting HIGH-QUALITY image processing...');

  const sharpInstance = sharp(buffer, {
    failOnError: false,
    density: 300,
    limitInputPixels: false,
  });

  // Get metadata
  const metadata = await sharpInstance.metadata();
  console.log(
    `📐 Source image: ${metadata.width}x${metadata.height}, ${metadata.format}, ${Math.round((metadata.size || 0) / 1024)}KB`
  );

  let pipeline = sharpInstance;
  let finalOutputSize = {
    width: metadata.width || 1920,
    height: metadata.height || 1080,
  };

  if (entityType === 'playlist' && playlistId && sourceUrl) {
    const cropProps = await getPlaylistCropProperties(playlistId, sourceUrl);

    pipeline = pipeline.extract({
      left: cropProps.x,
      top: cropProps.y,
      width: cropProps.width,
      height: cropProps.height,
    });

    const outputSize = cropProps.width <= 180 ? 512 : 1024;
    finalOutputSize = { width: outputSize, height: outputSize };

    pipeline = pipeline
      .resize(outputSize, outputSize, {
        fit: 'cover',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({
        sigma: 1.0,
        m1: 1.0,
        m2: 2.0,
        x1: 2.0,
        y2: 10.0,
        y3: 20.0,
      });
  }

  pipeline = pipeline.toColourspace('srgb');

  const pixelCount = finalOutputSize.width * finalOutputSize.height;
  const isLargeImage = pixelCount > 500000;

  const webpQuality = isLargeImage ? 92 : 95;
  const avifQuality = isLargeImage ? 85 : 88;

  const result: { webp: Buffer; avif: Buffer } = {
    webp: Buffer.alloc(0),
    avif: Buffer.alloc(0),
  };

  console.log('🔄 Generating HIGH-QUALITY WebP...');
  result.webp = await pipeline
    .clone()
    .webp({
      quality: webpQuality,
      effort: 6,
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      preset: 'photo',
      alphaQuality: 100,
    })
    .toBuffer();

  console.log('🔄 Generating HIGH-QUALITY AVIF...');
  result.avif = await pipeline
    .clone()
    .avif({
      quality: avifQuality,
      effort: 9,
      lossless: false,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();

  return result;
}

/**
 * Upload processed images to Supabase Storage with logging
 */
async function uploadToStorage(
  webpBuffer: Buffer,
  avifBuffer: Buffer,
  webpPath: string,
  avifPath: string
): Promise<{ webpPath: string; avifPath: string }> {
  const uploadStartTimestamp = new Date().toISOString();
  console.log(
    `📤 [${uploadStartTimestamp}] Starting upload to storage - WebP: ${webpPath} (${Math.round(webpBuffer.length / 1024)}KB), AVIF: ${avifPath} (${Math.round(avifBuffer.length / 1024)}KB)`
  );

  const results: { webpPath: string; avifPath: string } = {
    webpPath,
    avifPath,
  };

  // Upload WebP
  console.log(
    `📤 [${new Date().toISOString()}] Uploading WebP image to ${webpPath}...`
  );
  const webpUploadStart = Date.now();
  const { error: webpError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(webpPath, webpBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 year
      upsert: true,
    });

  const webpUploadDuration = Date.now() - webpUploadStart;
  if (webpError) {
    console.error(
      `❌ [${new Date().toISOString()}] Failed to upload WebP image after ${webpUploadDuration}ms: ${webpError.message}`
    );
    throw new Error(`Failed to upload WebP image: ${webpError.message}`);
  }
  console.log(
    `✅ [${new Date().toISOString()}] WebP upload completed in ${webpUploadDuration}ms`
  );

  // Upload AVIF
  console.log(
    `📤 [${new Date().toISOString()}] Uploading AVIF image to ${avifPath}...`
  );
  const avifUploadStart = Date.now();
  const { error: avifError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(avifPath, avifBuffer, {
      contentType: 'image/avif',
      cacheControl: '31536000', // 1 year
      upsert: true,
    });

  const avifUploadDuration = Date.now() - avifUploadStart;
  if (avifError) {
    console.error(
      `❌ [${new Date().toISOString()}] Failed to upload AVIF image after ${avifUploadDuration}ms: ${avifError.message}`
    );
    throw new Error(`Failed to upload AVIF image: ${avifError.message}`);
  }
  console.log(
    `✅ [${new Date().toISOString()}] AVIF upload completed in ${avifUploadDuration}ms`
  );

  const totalUploadTime = webpUploadDuration + avifUploadDuration;
  console.log(
    `✅ [${new Date().toISOString()}] Successfully uploaded both images in ${totalUploadTime}ms total (WebP: ${webpUploadDuration}ms, AVIF: ${avifUploadDuration}ms)`
  );

  return results;
}

/**
 * Process a single image: download, optimize, and upload with comprehensive logging
 */
export const processImage = inngest.createFunction(
  {
    id: 'process-image-hq',
    name: 'Process Single Image (High Quality)',
    retries: MAX_RETRIES,
    // Add entity-level concurrency control to prevent duplicate processing
    concurrency: [
      {
        limit: 1,
        key: 'event.data.entityType + "-" + event.data.entityId + "-" + event.data.imageType',
      },
    ],
  },
  { event: 'image.process' },
  async ({ event }): Promise<ProcessingResult> => {
    const {
      entityType,
      entityId,
      imageType,
      sourceUrl,
      jobId,
      pollingTimestamp,
      jobAttempts,
    } = event.data;
    const processingStartTimestamp = new Date().toISOString();
    const startTime = Date.now();

    console.log(
      `🚀 [${processingStartTimestamp}] Starting HIGH-QUALITY processing for ${entityType} ${entityId}, type: ${imageType}, job: ${jobId}`
    );
    console.log(
      `📋 [${processingStartTimestamp}] Job context - attempts: ${jobAttempts}/3, polled at: ${pollingTimestamp}`
    );
    console.log(`📸 [${processingStartTimestamp}] Source URL: ${sourceUrl}`);

    try {
      // Ensure we have a job ID - this should always be provided by the poller
      if (!jobId) {
        const errorMsg =
          'No job ID provided - jobs should be created by database triggers only';
        console.error(
          `❌ [${new Date().toISOString()}] CRITICAL ERROR: ${errorMsg}`
        );
        throw new Error(errorMsg);
      }

      console.log(
        `🔄 [${new Date().toISOString()}] Marking job ${jobId} as processing...`
      );

      // Mark the existing job as processing
      const { error: startError } = await supabase.rpc(
        'start_image_processing_job',
        {
          job_id: jobId,
        }
      );

      if (startError) {
        const errorMsg = `Failed to start job ${jobId}: ${startError.message}`;
        console.error(`❌ [${new Date().toISOString()}] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const markingDuration = Date.now() - startTime;
      console.log(
        `✅ [${new Date().toISOString()}] Marked job ${jobId} as processing in ${markingDuration}ms`
      );

      // Check existing images
      const existingCheckStart = Date.now();
      const { hasWebP, hasAVIF } = await checkExistingOptimizedImages(
        entityType,
        entityId
      );
      const existingCheckDuration = Date.now() - existingCheckStart;

      console.log(
        `🔍 [${new Date().toISOString()}] Existing images check completed in ${existingCheckDuration}ms - WebP: ${hasWebP}, AVIF: ${hasAVIF} - generating NEW high-quality versions`
      );

      // Delete existing images before creating new ones
      if (hasWebP || hasAVIF) {
        const deleteStart = Date.now();
        await deleteExistingOptimizedImages(entityType, entityId);
        const deleteDuration = Date.now() - deleteStart;
        console.log(
          `🗑️ [${new Date().toISOString()}] Deleted existing images in ${deleteDuration}ms`
        );
      } else {
        console.log(
          `ℹ️ [${new Date().toISOString()}] No existing images to delete`
        );
      }

      // Download source image
      console.log(
        `📥 [${new Date().toISOString()}] Downloading source image from: ${sourceUrl}`
      );
      const downloadStart = Date.now();
      const imageBuffer = await downloadImage(sourceUrl);
      const downloadDuration = Date.now() - downloadStart;
      console.log(
        `✅ [${new Date().toISOString()}] Downloaded ${Math.round(imageBuffer.length / 1024)}KB in ${downloadDuration}ms`
      );

      // Process image with HIGH QUALITY settings
      console.log(
        `🎨 [${new Date().toISOString()}] Starting HIGH-QUALITY image processing...`
      );
      const processStart = Date.now();
      const { webp: webpBuffer, avif: avifBuffer } = await processImageFormats(
        imageBuffer,
        entityType,
        entityType === 'playlist' ? entityId : undefined,
        sourceUrl
      );
      const processDuration = Date.now() - processStart;
      console.log(
        `✅ [${new Date().toISOString()}] Image processing completed in ${processDuration}ms (WebP: ${Math.round(webpBuffer.length / 1024)}KB, AVIF: ${Math.round(avifBuffer.length / 1024)}KB)`
      );

      // Generate storage paths with job context
      console.log(
        `📂 [${new Date().toISOString()}] Generating storage paths...`
      );
      const pathStart = Date.now();
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        entityId,
        imageType,
        jobId
      );
      const pathDuration = Date.now() - pathStart;
      console.log(
        `📂 [${new Date().toISOString()}] Storage paths generated in ${pathDuration}ms`
      );

      // Upload to storage
      console.log(
        `📤 [${new Date().toISOString()}] Uploading optimized images to storage...`
      );
      const uploadStart = Date.now();
      const uploadResult = await uploadToStorage(
        webpBuffer,
        avifBuffer,
        webpPath,
        avifPath
      );
      const uploadDuration = Date.now() - uploadStart;
      console.log(
        `✅ [${new Date().toISOString()}] Upload completed in ${uploadDuration}ms`
      );

      // Mark job as completed using the existing jobId
      console.log(
        `🏁 [${new Date().toISOString()}] Marking job ${jobId} as completed...`
      );
      const completeStart = Date.now();
      const { error: completeError } = await supabase.rpc(
        'complete_image_processing_job',
        {
          job_id: jobId,
          webp_path: uploadResult.webpPath,
          avif_path: uploadResult.avifPath,
        }
      );
      const completeDuration = Date.now() - completeStart;

      if (completeError) {
        const errorMsg = `Failed to complete job ${jobId}: ${completeError.message}`;
        console.error(`❌ [${new Date().toISOString()}] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const totalProcessingTime = Date.now() - startTime;
      console.log(
        `🎉 [${new Date().toISOString()}] Successfully processed HIGH-QUALITY image for ${entityType} ${entityId} in ${totalProcessingTime}ms (job: ${jobId})`
      );
      console.log(
        `📊 [${new Date().toISOString()}] Processing breakdown - marking: ${markingDuration}ms, existing check: ${existingCheckDuration}ms, download: ${downloadDuration}ms, processing: ${processDuration}ms, upload: ${uploadDuration}ms, completion: ${completeDuration}ms`
      );

      return {
        webpPath: uploadResult.webpPath,
        avifPath: uploadResult.avifPath,
      };
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      const totalErrorTime = Date.now() - startTime;

      console.error(
        `❌ [${errorTimestamp}] Failed to process HIGH-QUALITY image for ${entityType} ${entityId} (job: ${jobId}) after ${totalErrorTime}ms:`,
        error
      );

      // Mark the existing job as failed
      if (jobId) {
        try {
          console.log(
            `🔄 [${new Date().toISOString()}] Marking job ${jobId} as failed...`
          );
          const failStart = Date.now();

          await supabase.rpc('fail_image_processing_job', {
            job_id: jobId,
            error_msg: error instanceof Error ? error.message : String(error),
          });

          const failDuration = Date.now() - failStart;
          console.log(
            `❌ [${new Date().toISOString()}] Marked job ${jobId} as failed in ${failDuration}ms`
          );
        } catch (jobError) {
          console.error(
            `💥 [${new Date().toISOString()}] Failed to mark job ${jobId} as failed:`,
            jobError
          );
        }
      }

      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

/**
 * Process multiple images in batch with HIGH QUALITY
 */
export const batchProcessImages = inngest.createFunction(
  {
    id: 'batch-process-images-hq',
    name: 'Batch Process Images (High Quality)',
    concurrency: process.env.NODE_ENV === 'development' ? 1 : 3, // Reduced for quality processing
  },
  { event: 'image.batch.process' },
  async ({ event }) => {
    const { jobs } = event.data;

    console.log(
      `🚀 Starting HIGH-QUALITY batch processing of ${jobs.length} images`
    );

    const results = [];

    // Process sequentially in development, with longer delays for quality processing
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '🐌 Development mode: Processing HIGH-QUALITY images sequentially'
      );
      for (const job of jobs) {
        try {
          await inngest.send({
            name: 'image.process',
            data: job,
          });
          results.push({ success: true, entityId: job.entityId });

          // Longer delay for quality processing
          await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay
        } catch (error) {
          console.error(
            `❌ Failed to queue HIGH-QUALITY processing for ${job.entityType} ${job.entityId}:`,
            error
          );
          results.push({
            success: false,
            entityId: job.entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      // Production: parallel with reduced concurrency for quality
      for (const job of jobs) {
        try {
          await inngest.send({
            name: 'image.process',
            data: job,
          });
          results.push({ success: true, entityId: job.entityId });
        } catch (error) {
          console.error(
            `❌ Failed to queue HIGH-QUALITY processing for ${job.entityType} ${job.entityId}:`,
            error
          );
          results.push({
            success: false,
            entityId: job.entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(
      `🎯 HIGH-QUALITY batch processing completed: ${successful} successful, ${failed} failed`
    );

    return {
      totalJobs: jobs.length,
      successful,
      failed,
      results,
    };
  }
);

/**
 * Cleanup old or failed processing jobs
 */
export const cleanupFailedJobs = inngest.createFunction(
  {
    id: 'cleanup-failed-jobs',
    name: 'Cleanup Failed Jobs',
  },
  { event: 'image.cleanup' },
  async ({ event }) => {
    const { olderThanHours = 24, status = 'failed' } = event.data;

    console.log(
      `🧹 Cleaning up ${status} jobs older than ${olderThanHours} hours`
    );

    const cutoffTime = new Date(
      Date.now() - olderThanHours * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from('image_processing_jobs')
      .delete()
      .eq('status', status)
      .lt('updated_at', cutoffTime)
      .select();

    if (error) {
      throw new Error(`Failed to cleanup jobs: ${error.message}`);
    }

    const deletedCount = data?.length || 0;

    console.log(`✅ Cleanup completed: removed ${deletedCount} ${status} jobs`);
    return { deletedCount };
  }
);

import { pollPendingJobs } from './async-image-processing/job_poller';

// Export all functions
export const imageFunctions = [
  processImage,
  batchProcessImages,
  cleanupFailedJobs,
  pollPendingJobs,
];
