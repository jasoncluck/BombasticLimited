import { inngest, type ImageProcessingEvent, type BatchImageProcessingEvent, type CleanupJobsEvent } from './client';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { validateImageUrl } from '../server/image-processing';

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configuration
const STORAGE_BUCKET = 'optimized-images';
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
function generateStoragePaths(entityType: string, entityId: string, imageType: string) {
  const basePath = `${entityType}s/${entityId}/${imageType}`;
  return {
    webpPath: `${basePath}.webp`,
    avifPath: `${basePath}.avif`,
  };
}

/**
 * Download and validate image from source URL
 */
async function downloadImage(sourceUrl: string): Promise<Buffer> {
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
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Process image buffer into WebP and AVIF formats
 */
async function processImageFormats(buffer: Buffer): Promise<{ webp: Buffer; avif: Buffer }> {
  const sharpInstance = sharp(buffer);
  
  // Get metadata for optimization
  const metadata = await sharpInstance.metadata();
  
  // Calculate optimal quality based on image characteristics
  const baseQuality = 85;
  const webpQuality = Math.min(baseQuality, 90);
  const avifQuality = Math.min(baseQuality - 5, 85); // AVIF is more efficient
  
  // Apply resize if image is too large (max 1920px width)
  let pipeline = sharpInstance;
  if (metadata.width && metadata.width > 1920) {
    pipeline = pipeline.resize(1920, null, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  }

  // Generate WebP
  const webpBuffer = await pipeline
    .clone()
    .webp({
      quality: webpQuality,
      effort: 3,
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
    })
    .toBuffer();

  // Generate AVIF
  const avifBuffer = await pipeline
    .clone()
    .avif({
      quality: avifQuality,
      effort: 4,
      lossless: false,
    })
    .toBuffer();

  return { webp: webpBuffer, avif: avifBuffer };
}

/**
 * Upload processed images to Supabase Storage
 */
async function uploadToStorage(webpBuffer: Buffer, avifBuffer: Buffer, webpPath: string, avifPath: string): Promise<{ webpPath: string; avifPath: string }> {
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
    
    console.log(`Processing image for ${entityType} ${entityId}, type: ${imageType}`);

    try {
      // Get and mark job as processing
      const { data: jobId, error: jobError } = await supabase.rpc('queue_image_processing_job', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_image_type: imageType,
        p_source_url: sourceUrl,
        p_priority: event.data.priority || 100,
      });

      if (jobError) {
        throw new Error(`Failed to queue job: ${jobError.message}`);
      }

      await supabase.rpc('start_image_processing_job', { job_id: jobId });

      // Download source image
      const imageBuffer = await downloadImage(sourceUrl);

      // Process image into WebP and AVIF
      const { webp: webpBuffer, avif: avifBuffer } = await processImageFormats(imageBuffer);

      // Generate storage paths
      const { webpPath, avifPath } = generateStoragePaths(entityType, entityId, imageType);

      // Upload to Supabase Storage
      const uploadResult = await uploadToStorage(webpBuffer, avifBuffer, webpPath, avifPath);

      // Mark job as completed
      const { error: completeError } = await supabase.rpc('complete_image_processing_job', {
        job_id: jobId,
        webp_path: uploadResult.webpPath,
        avif_path: uploadResult.avifPath,
      });

      if (completeError) {
        throw new Error(`Failed to complete job: ${completeError.message}`);
      }

      console.log(`Successfully processed image for ${entityType} ${entityId}`);
      return {
        webpPath: uploadResult.webpPath,
        avifPath: uploadResult.avifPath,
      };

    } catch (error) {
      console.error(`Failed to process image for ${entityType} ${entityId}:`, error);
      
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
    concurrency: 5, // Limit concurrent batch processing
  },
  { event: 'image.batch.process' },
  async ({ event }) => {
    const { jobs } = event.data;
    
    console.log(`Starting batch processing of ${jobs.length} images`);

    const results = [];

    // Process images in parallel with concurrency limit
    for (const job of jobs) {
      try {
        // Send individual processing event
        await inngest.send({
          name: 'image.process',
          data: job,
        });
        results.push({ success: true, entityId: job.entityId });
      } catch (error) {
        console.error(`Failed to queue processing for ${job.entityType} ${job.entityId}:`, error);
        results.push({ 
          success: false, 
          entityId: job.entityId, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Batch processing completed: ${successful} successful, ${failed} failed`);
    
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

    console.log(`Cleaning up ${status} jobs older than ${olderThanHours} hours`);

    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

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
export const imageFunctions = [processImage, batchProcessImages, cleanupFailedJobs];