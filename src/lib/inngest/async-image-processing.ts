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
const PROCESSING_TIMEOUT = 60000; // Increased timeout for quality processing

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
  webpPath?: string;
  avifPath?: string;
  error?: string;
}

/**
 * Delete existing optimized images for an entity
 */
async function deleteExistingOptimizedImages(
  entityType: string,
  entityId: string
): Promise<void> {
  if (entityType === 'playlist') {
    // Get current image URLs from database
    const { data: playlist, error } = await supabase
      .from('playlists')
      .select('image_webp_url, image_avif_url')
      .eq('id', entityId)
      .single();

    if (error) {
      console.warn(`Failed to get existing playlist images: ${error.message}`);
      return;
    }

    const filesToDelete = [];
    if (playlist?.image_webp_url) {
      filesToDelete.push(playlist.image_webp_url);
    }
    if (playlist?.image_avif_url) {
      filesToDelete.push(playlist.image_avif_url);
    }

    if (filesToDelete.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(filesToDelete);

      if (deleteError) {
        console.warn(
          `Failed to delete existing images: ${deleteError.message}`
        );
      } else {
        console.log(
          `Deleted ${filesToDelete.length} existing images for playlist ${entityId}`
        );
      }
    }
  }
}

/**
 * Generate storage paths for optimized images
 */
function generateStoragePaths(
  entityType: string,
  entityId: string,
  imageType: string
): { webpPath: string; avifPath: string } {
  const timestamp = Date.now();

  if (entityType === 'playlist') {
    // Use playlists/{playlistId}/ structure
    const basePath = `playlists/${entityId}/playlist-${entityId}-${timestamp}`;
    return {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };
  } else if (entityType === 'video') {
    // Keep existing video structure
    if (imageType === 'thumbnail') {
      const basePath = `thumbnails/${entityId}/thumbnail-${entityId}-${timestamp}`;
      return {
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };
    } else if (imageType === 'thumbnail_maxres') {
      const basePath = `thumbnails/${entityId}/thumbnail-maxres-${entityId}-${timestamp}`;
      return {
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };
    }
  }

  // Fallback
  const basePath = `${entityType}s/${entityId}/${entityType}-${entityId}-${timestamp}`;
  return {
    webpPath: `${basePath}.webp`,
    avifPath: `${basePath}.avif`,
  };
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
    // **QUALITY: Enhanced input options**
    failOnError: false,
    density: 300, // High DPI for quality
    limitInputPixels: false, // Allow large images
  });

  // Get metadata for optimization
  const metadata = await sharpInstance.metadata();
  console.log(
    `📐 Source image: ${metadata.width}x${metadata.height}, ${metadata.format}, ${Math.round((metadata.size || 0) / 1024)}KB`
  );

  // Apply playlist-specific cropping
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

    console.log(
      `✂️ Applied crop: ${cropProps.width}x${cropProps.height} from ${metadata.width}x${metadata.height} at (${cropProps.x}, ${cropProps.y})`
    );

    // **QUALITY: High-resolution output sizes**
    // Create multiple sizes for responsive images
    const outputSize = cropProps.width <= 180 ? 512 : 1024; // Much larger for quality
    finalOutputSize = { width: outputSize, height: outputSize };

    pipeline = pipeline
      .resize(outputSize, outputSize, {
        fit: 'cover',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3, // **QUALITY: Best resampling algorithm**
      })
      // **QUALITY: Advanced sharpening**
      .sharpen({
        sigma: 1.0,
        m1: 1.0,
        m2: 2.0,
        x1: 2.0,
        y2: 10.0,
        y3: 20.0,
      });

    console.log(`📏 Resized to: ${outputSize}x${outputSize} (HIGH-QUALITY)`);
  }

  // **QUALITY: Advanced preprocessing**
  pipeline = pipeline
    // Normalize image
    .normalize()
    // Enhance contrast slightly
    .modulate({
      brightness: 1.02,
      saturation: 1.05,
      hue: 0,
    });

  // **QUALITY: Calculate adaptive quality based on content and size**
  const pixelCount = finalOutputSize.width * finalOutputSize.height;
  const isLargeImage = pixelCount > 500000; // 500K pixels

  // Higher quality for smaller images, optimized for larger ones
  const webpQuality = isLargeImage ? 92 : 95;
  const avifQuality = isLargeImage ? 85 : 88;

  const result: { webp: Buffer; avif: Buffer } = {
    webp: Buffer.alloc(0),
    avif: Buffer.alloc(0),
  };

  // **HIGH-QUALITY WebP** - Maximum effort for best compression
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

  const webpSizeKB = Math.round(result.webp.length / 1024);
  console.log(`✅ WebP generated: ${webpSizeKB}KB at quality ${webpQuality}`);

  // **HIGH-QUALITY AVIF** - Maximum effort for best compression
  console.log('🔄 Generating HIGH-QUALITY AVIF...');
  result.avif = await pipeline
    .clone()
    .avif({
      quality: avifQuality,
      effort: 9, // **QUALITY: Maximum effort (0-9)**
      lossless: false,
    })
    .toBuffer();

  const avifSizeKB = Math.round(result.avif.length / 1024);
  const compressionRatio = Math.round(
    ((result.webp.length - result.avif.length) / result.webp.length) * 100
  );

  console.log(
    `✅ AVIF generated: ${avifSizeKB}KB at quality ${avifQuality} (${compressionRatio}% smaller than WebP)`
  );
  console.log(
    `🎯 Total processing completed: WebP=${webpSizeKB}KB, AVIF=${avifSizeKB}KB`
  );

  return result;
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
  const results: { webpPath: string; avifPath: string } = {
    webpPath,
    avifPath,
  };

  console.log('📤 Uploading optimized images to storage...');

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

  console.log(`✅ Successfully uploaded: ${webpPath}, ${avifPath}`);
  return results;
}

/**
 * Process a single image: download, optimize, and upload
 */
export const processImage = inngest.createFunction(
  {
    id: 'process-image-hq',
    name: 'Process Single Image (High Quality)',
    retries: MAX_RETRIES,
  },
  { event: 'image.process' },
  async ({ event }): Promise<ProcessingResult> => {
    const { entityType, entityId, imageType, sourceUrl } = event.data;

    console.log(
      `🚀 Starting HIGH-QUALITY processing for ${entityType} ${entityId}, type: ${imageType}`
    );
    console.log(`📸 Source URL: ${sourceUrl}`);

    const startTime = Date.now();

    try {
      // Check existing images
      const { hasWebP, hasAVIF } = await checkExistingOptimizedImages(
        entityType,
        entityId
      );

      console.log(
        `🔍 Existing images for ${entityType} ${entityId}: WebP: ${hasWebP}, AVIF: ${hasAVIF} - generating NEW high-quality versions`
      );

      // Delete existing images before creating new ones
      if (hasWebP || hasAVIF) {
        await deleteExistingOptimizedImages(entityType, entityId);
      }

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
      console.log('📥 Downloading source image...');
      const imageBuffer = await downloadImage(sourceUrl);
      console.log(`✅ Downloaded ${Math.round(imageBuffer.length / 1024)}KB`);

      // Process image with HIGH QUALITY settings
      const { webp: webpBuffer, avif: avifBuffer } = await processImageFormats(
        imageBuffer,
        entityType,
        entityType === 'playlist' ? entityId : undefined,
        sourceUrl
      );

      // Generate storage paths
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        entityId,
        imageType
      );

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

      const processingTime = Date.now() - startTime;
      console.log(
        `🎉 Successfully processed HIGH-QUALITY image for ${entityType} ${entityId} in ${processingTime}ms`
      );

      return {
        webpPath: uploadResult.webpPath,
        avifPath: uploadResult.avifPath,
      };
    } catch (error) {
      console.error(
        `❌ Failed to process HIGH-QUALITY image for ${entityType} ${entityId}:`,
        error
      );

      // Mark job as failed
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

// Export all functions
export const imageFunctions = [
  processImage,
  batchProcessImages,
  cleanupFailedJobs,
];
