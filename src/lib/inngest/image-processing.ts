import { inngest } from './client';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { validateImageUrl } from '../server/image-processing';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { IMAGES_BUCKET } from '$lib/constants/images';

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
const PROCESSING_TIMEOUT = 30000; // 30 seconds

// Domain validation for security
const ALLOWED_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'static-cdn.jtvnw.net',
];

interface ProcessingResult {
  webpPath?: string;
  avifPath?: string;
  error?: string;
}

/**
 * Generate storage paths for optimized images
 */
function generateStoragePaths(
  entityType: string,
  entityId: string,
  imageType: string
) {
  const basePath = `${entityType}s/${entityId}/${imageType}`;
  return {
    webpPath: `${basePath}.webp`,
    avifPath: `${basePath}.avif`,
  };
}

/**
 * Download and validate image from source URL (supports external URLs and Supabase Storage paths)
 */
async function downloadImage(sourceUrl: string): Promise<Buffer> {
  // Check if it's a Supabase Storage path (starts with playlists/ or videos/)
  if (sourceUrl.startsWith('playlists/') || sourceUrl.startsWith('videos/')) {
    // Download from Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(sourceUrl);

    if (error) {
      throw new Error(`Failed to download from storage: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  // Handle external URLs (YouTube thumbnails, etc.)
  if (!validateImageUrl(sourceUrl)) {
    throw new Error(`Invalid or disallowed image URL: ${sourceUrl}`);
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
 * Process image buffer into WebP and AVIF formats with throttling and optional cropping
 */
async function processImageFormats(
  buffer: Buffer,
  entityType?: string,
  imageType?: string,
  sourceUrl?: string
): Promise<{ webp: Buffer; avif: Buffer }> {
  // Add throttling to prevent server overload
  const throttleDelay = process.env.NODE_ENV === 'development' ? 1000 : 0; // 1 second delay in dev
  if (throttleDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, throttleDelay));
  }

  const sharpInstance = sharp(buffer);

  // Get metadata for optimization
  const metadata = await sharpInstance.metadata();

  // Apply playlist-specific square cropping if this is a playlist from external source (YouTube)
  // Skip cropping for uploaded images from storage (they're already cropped by user)
  let pipeline = sharpInstance;
  const isUploadedImage =
    sourceUrl?.startsWith('playlists/') || sourceUrl?.startsWith('videos/');

  if (entityType === 'playlist' && !isUploadedImage) {
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    // Create square crop based on image dimensions (only for YouTube thumbnails)
    const cropDimensions = getPlaylistCropDimensions(
      imageWidth,
      imageHeight,
      imageType === 'thumbnail_maxres'
    );

    pipeline = pipeline.extract({
      left: cropDimensions.x,
      top: cropDimensions.y,
      width: cropDimensions.width,
      height: cropDimensions.height,
    });

    console.log(
      `Applied playlist square crop: ${cropDimensions.width}x${cropDimensions.height} from ${imageWidth}x${imageHeight}`
    );
  }

  // Calculate optimal quality based on image characteristics
  const baseQuality = 85;
  const webpQuality = Math.min(baseQuality, 90);
  const avifQuality = Math.min(baseQuality - 5, 85); // AVIF is more efficient

  // Apply resize if image is too large (max 1920px width)
  if (metadata.width && metadata.width > 1920) {
    pipeline = pipeline.resize(1920, null, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  }

  // Generate WebP with lower effort in development to reduce CPU usage
  const webpEffort = process.env.NODE_ENV === 'development' ? 1 : 3;
  const webpBuffer = await pipeline
    .clone()
    .webp({
      quality: webpQuality,
      effort: webpEffort,
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
    })
    .toBuffer();

  // Generate AVIF with lower effort in development
  const avifEffort = process.env.NODE_ENV === 'development' ? 2 : 4;
  const avifBuffer = await pipeline
    .clone()
    .avif({
      quality: avifQuality,
      effort: avifEffort,
      lossless: false,
    })
    .toBuffer();

  return { webp: webpBuffer, avif: avifBuffer };
}

/**
 * Get optimal crop dimensions for playlist square images
 */
function getPlaylistCropDimensions(
  imageWidth: number,
  imageHeight: number,
  isMaxRes: boolean
): { x: number; y: number; width: number; height: number } {
  if (isMaxRes) {
    // For maxres images (1280x720), crop 720x720 square from center
    if (imageWidth === 1280 && imageHeight === 720) {
      return {
        x: Math.round((1280 - 720) / 2), // 280px from left
        y: 0,
        width: 720,
        height: 720,
      };
    }
  } else {
    // For standard resolution images, detect YouTube thumbnail sizes
    if (imageWidth === 320 && imageHeight === 180) {
      // Medium thumbnail: crop 180x180 square from center
      return {
        x: Math.round((320 - 180) / 2), // 70px from left
        y: 0,
        width: 180,
        height: 180,
      };
    } else if (imageWidth === 480 && imageHeight === 360) {
      // High thumbnail: crop 360x360 square from center
      return {
        x: Math.round((480 - 360) / 2), // 60px from left
        y: 0,
        width: 360,
        height: 360,
      };
    } else if (imageWidth === 120 && imageHeight === 90) {
      // Default thumbnail: crop 90x90 square from center
      return {
        x: Math.round((120 - 90) / 2), // 15px from left
        y: 0,
        width: 90,
        height: 90,
      };
    }
  }

  // For unknown sizes, create centered square crop
  const cropSize = Math.min(imageWidth, imageHeight);
  return {
    x: Math.round((imageWidth - cropSize) / 2),
    y: Math.round((imageHeight - cropSize) / 2),
    width: cropSize,
    height: cropSize,
  };
}

/**
 * Upload processed images to Supabase Storage
 */
async function uploadToStorage(
  webpBuffer: Buffer,
  avifBuffer: Buffer,
  webpPath: string,
  avifPath: string
): Promise<{ webpPath: string; avifPath: string }> {
  // Upload WebP
  const { error: webpError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(webpPath, webpBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 year
      upsert: true,
    });

  if (webpError) {
    throw new Error(`Failed to upload WebP image: ${webpError.message}`);
  }

  // Upload AVIF
  const { error: avifError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(avifPath, avifBuffer, {
      contentType: 'image/avif',
      cacheControl: '31536000', // 1 year
      upsert: true,
    });

  if (avifError) {
    throw new Error(`Failed to upload AVIF image: ${avifError.message}`);
  }

  return { webpPath, avifPath };
}

/**
 * Process a single image: download, optimize, and upload
 */
export const processImage = inngest.createFunction(
  {
    id: 'process-image',
    name: 'Process Single Image',
    retries: MAX_RETRIES,
  },
  { event: 'image.process' },
  async ({ event }): Promise<ProcessingResult> => {
    const { entityType, entityId, imageType, sourceUrl } = event.data;

    console.log(
      `Processing image for ${entityType} ${entityId}, type: ${imageType}`
    );

    try {
      // Get and mark job as processing
      const { data: jobId, error: jobError } = await supabase.rpc(
        'queue_image_processing_job',
        {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_image_type: imageType,
          p_source_url: sourceUrl,
          p_priority: event.data.priority || 100,
        }
      );

      if (jobError) {
        throw new Error(`Failed to queue job: ${jobError.message}`);
      }

      await supabase.rpc('start_image_processing_job', { job_id: jobId });

      // Download source image
      const imageBuffer = await downloadImage(sourceUrl);

      // Process image into WebP and AVIF
      const { webp: webpBuffer, avif: avifBuffer } = await processImageFormats(
        imageBuffer,
        entityType,
        imageType,
        sourceUrl
      );

      // Generate storage paths
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        entityId,
        imageType
      );

      // Upload to Supabase Storage
      const uploadResult = await uploadToStorage(
        webpBuffer,
        avifBuffer,
        webpPath,
        avifPath
      );

      // Mark job as completed
      const { error: completeError } = await supabase.rpc(
        'complete_image_processing_job',
        {
          job_id: jobId,
          webp_path: uploadResult.webpPath,
          avif_path: uploadResult.avifPath,
        }
      );

      if (completeError) {
        throw new Error(`Failed to complete job: ${completeError.message}`);
      }

      console.log(`Successfully processed image for ${entityType} ${entityId}`);
      return {
        webpPath: uploadResult.webpPath,
        avifPath: uploadResult.avifPath,
      };
    } catch (error) {
      console.error(
        `Failed to process image for ${entityType} ${entityId}:`,
        error
      );

      // Mark job as failed if we have a job ID
      try {
        const { data } = await supabase
          .from('image_processing_jobs')
          .select('id')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .eq('image_type', imageType)
          .eq('status', 'processing')
          .single();

        if (data?.id) {
          await supabase.rpc('fail_image_processing_job', {
            job_id: data.id,
            error_msg: error instanceof Error ? error.message : String(error),
          });
        }
      } catch (jobError) {
        console.error('Failed to mark job as failed:', jobError);
      }

      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

/**
 * Process multiple images in batch
 */
export const batchProcessImages = inngest.createFunction(
  {
    id: 'batch-process-images',
    name: 'Batch Process Images',
    concurrency: process.env.NODE_ENV === 'development' ? 1 : 5, // Reduce concurrency in dev
  },
  { event: 'image.batch.process' },
  async ({ event }) => {
    const { jobs } = event.data;

    console.log(`Starting batch processing of ${jobs.length} images`);

    const results = [];

    // In development, process sequentially to prevent server overload
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Processing images sequentially');
      for (const job of jobs) {
        try {
          // Send individual processing event
          await inngest.send({
            name: 'image.process',
            data: job,
          });
          results.push({ success: true, entityId: job.entityId });

          // Add delay between jobs in development
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
        } catch (error) {
          console.error(
            `Failed to queue processing for ${job.entityType} ${job.entityId}:`,
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
      // Process images in parallel with concurrency limit in production
      for (const job of jobs) {
        try {
          // Send individual processing event
          await inngest.send({
            name: 'image.process',
            data: job,
          });
          results.push({ success: true, entityId: job.entityId });
        } catch (error) {
          console.error(
            `Failed to queue processing for ${job.entityType} ${job.entityId}:`,
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
      `Batch processing completed: ${successful} successful, ${failed} failed`
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
      `Cleaning up ${status} jobs older than ${olderThanHours} hours`
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

    console.log(`Cleanup completed: removed ${deletedCount} ${status} jobs`);
    return { deletedCount };
  }
);

// Export all functions
export const imageFunctions = [
  processImage,
  batchProcessImages,
  cleanupFailedJobs,
];
