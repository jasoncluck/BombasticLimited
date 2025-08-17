import { inngest } from './client';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
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

// Crop defaults
interface ImageProperties {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS: ImageProperties = {
  x: 280,
  y: 0,
  height: 720,
  width: 720,
};

const PLAYLIST_IMAGE_CROP_DEFAULTS: ImageProperties = {
  x: 70, // (320-180)/2 = 70
  y: 0,
  height: 180,
  width: 180,
};

interface ProcessingResult {
  jpgPath?: string;
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
): { jpgPath?: string; webpPath: string; avifPath: string } {
  const timestamp = Date.now();

  if (entityType === 'playlist') {
    // Use playlist-images/{playlistId}/ structure
    const basePath = `playlist-images/${entityId}/playlist-${entityId}-${timestamp}`;
    return {
      // No JPG path for playlists in background processing
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };
  } else if (entityType === 'video') {
    // Keep existing video structure
    if (imageType === 'thumbnail') {
      const basePath = `thumbnails/${entityId}/thumbnail-${entityId}-${timestamp}`;
      return {
        jpgPath: `${basePath}.jpg`,
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };
    } else if (imageType === 'thumbnail_maxres') {
      const basePath = `thumbnails/${entityId}/thumbnail-maxres-${entityId}-${timestamp}`;
      return {
        jpgPath: `${basePath}.jpg`,
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };
    }
  }

  // Fallback
  const basePath = `${entityType}s/${entityId}/${entityType}-${entityId}-${timestamp}`;
  return {
    jpgPath: `${basePath}.jpg`,
    webpPath: `${basePath}.webp`,
    avifPath: `${basePath}.avif`,
  };
}

/**
 * Download and validate image from source URL
 */
async function downloadImage(sourceUrl: string): Promise<Buffer> {
  // Check if it's a Supabase Storage path (starts with playlist-images/ or thumbnails/)
  if (
    sourceUrl.startsWith('playlist-images/') ||
    sourceUrl.startsWith('thumbnails/')
  ) {
    // Download from Supabase Storage
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
): Promise<ImageProperties> {
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
    const props = playlist.image_properties as ImageProperties;
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
  // Check if this looks like a maxres URL or get image dimensions
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
 * Process image buffer into different formats with optional cropping
 */
async function processImageFormats(
  buffer: Buffer,
  entityType?: string,
  playlistId?: string,
  sourceUrl?: string
): Promise<{ jpg?: Buffer; webp: Buffer; avif: Buffer }> {
  // Add throttling to prevent server overload
  const throttleDelay = process.env.NODE_ENV === 'development' ? 1000 : 0; // 1 second delay in dev
  if (throttleDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, throttleDelay));
  }

  const sharpInstance = sharp(buffer);

  // Get metadata for optimization
  const metadata = await sharpInstance.metadata();

  // Apply playlist-specific cropping
  let pipeline = sharpInstance;
  if (entityType === 'playlist' && playlistId && sourceUrl) {
    const cropProps = await getPlaylistCropProperties(playlistId, sourceUrl);

    pipeline = pipeline.extract({
      left: cropProps.x,
      top: cropProps.y,
      width: cropProps.width,
      height: cropProps.height,
    });

    console.log(
      `Applied playlist crop: ${cropProps.width}x${cropProps.height} from ${metadata.width}x${metadata.height} at (${cropProps.x}, ${cropProps.y})`
    );
  }

  // Calculate optimal quality based on image characteristics
  const baseQuality = 85;
  const jpgQuality = Math.min(baseQuality, 90);
  const webpQuality = Math.min(baseQuality, 90);
  const avifQuality = Math.min(baseQuality - 5, 85); // AVIF is more efficient

  // Apply resize if image is too large (max 1920px width)
  if (metadata.width && metadata.width > 1920) {
    pipeline = pipeline.resize(1920, null, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  }

  const result: { jpg?: Buffer; webp: Buffer; avif: Buffer } = {
    webp: Buffer.alloc(0),
    avif: Buffer.alloc(0),
  };

  // Generate JPG only for videos (not playlists)
  if (entityType === 'video') {
    result.jpg = await pipeline
      .clone()
      .jpeg({
        quality: jpgQuality,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();
  }

  // Generate WebP with lower effort in development to reduce CPU usage
  const webpEffort = process.env.NODE_ENV === 'development' ? 1 : 3;
  result.webp = await pipeline
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
  result.avif = await pipeline
    .clone()
    .avif({
      quality: avifQuality,
      effort: avifEffort,
      lossless: false,
    })
    .toBuffer();

  return result;
}

/**
 * Upload processed images to Supabase Storage
 */
async function uploadToStorage(
  jpgBuffer: Buffer | null,
  webpBuffer: Buffer,
  avifBuffer: Buffer,
  jpgPath: string | undefined,
  webpPath: string,
  avifPath: string
): Promise<{ jpgPath?: string; webpPath: string; avifPath: string }> {
  const results: { jpgPath?: string; webpPath: string; avifPath: string } = {
    webpPath,
    avifPath,
  };

  // Upload JPG if provided (only for videos now)
  if (jpgBuffer && jpgPath) {
    const { error: jpgError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(jpgPath, jpgBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000', // 1 year
        upsert: true,
      });

    if (jpgError) {
      throw new Error(`Failed to upload JPG image: ${jpgError.message}`);
    }
    results.jpgPath = jpgPath;
  }

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

  return results;
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

      // Process image into different formats
      const {
        jpg: jpgBuffer,
        webp: webpBuffer,
        avif: avifBuffer,
      } = await processImageFormats(
        imageBuffer,
        entityType,
        entityType === 'playlist' ? entityId : undefined,
        sourceUrl
      );

      // Generate storage paths
      const { jpgPath, webpPath, avifPath } = generateStoragePaths(
        entityType,
        entityId,
        imageType
      );

      // Upload to Supabase Storage (no JPG for playlists)
      const uploadResult = await uploadToStorage(
        jpgBuffer || null,
        webpBuffer,
        avifBuffer,
        jpgPath,
        webpPath,
        avifPath
      );

      // Mark job as completed
      const { error: completeError } = await supabase.rpc(
        'complete_image_processing_job',
        {
          job_id: jobId,
          jpg_path: uploadResult.jpgPath,
          webp_path: uploadResult.webpPath,
          avif_path: uploadResult.avifPath,
        }
      );

      if (completeError) {
        throw new Error(`Failed to complete job: ${completeError.message}`);
      }

      console.log(`Successfully processed image for ${entityType} ${entityId}`);
      return {
        jpgPath: uploadResult.jpgPath,
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
