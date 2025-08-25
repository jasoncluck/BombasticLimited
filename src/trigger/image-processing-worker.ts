import { task } from '@trigger.dev/sdk/v3';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { IMAGES_BUCKET } from '$lib/constants/images';
import {
  calculateDynamicCropDimensions,
  validateAndAdjustCropDimensions,
} from '$lib/utils/dynamic-crop-dimensions';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing supabase env vars.');
}

// Supabase client setup
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Configuration constants - reduced from 60s to 25s to fit within task timeout
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

interface ExistingVideoData {
  image_processing_updated_at: string | null;
  thumbnail_url: string | null;
  thumbnail_webp_url: string | null;
  thumbnail_avif_url: string | null;
}

interface ExistingPlaylistData {
  image_processing_updated_at: string | null;
  thumbnail_url: string | null;
  image_webp_url: string | null;
  image_avif_url: string | null;
}

// Check if entity was recently processed to avoid unnecessary work
async function checkRecentProcessing(
  entityType: string,
  entityId: string,
  currentThumbnailUrl: string
): Promise<{ shouldSkip: boolean; reason?: string }> {
  const table = entityType === 'playlist' ? 'playlists' : 'videos';
  const selectFields =
    entityType === 'playlist'
      ? 'image_processing_updated_at, thumbnail_url, image_webp_url, image_avif_url'
      : 'image_processing_updated_at, thumbnail_url, thumbnail_webp_url, thumbnail_avif_url';

  const { data: existing, error } = await supabase
    .from(table)
    .select(selectFields)
    .eq('id', entityId)
    .maybeSingle();

  if (error || !existing) {
    return { shouldSkip: false };
  }

  // Check if already processed recently with same thumbnail URL
  if (
    existing.image_processing_updated_at &&
    existing.thumbnail_url === currentThumbnailUrl
  ) {
    const lastProcessed = new Date(existing.image_processing_updated_at);
    const now = new Date();
    const hoursSinceProcessed =
      (now.getTime() - lastProcessed.getTime()) / (1000 * 60 * 60);

    // Skip if processed within last hour with same thumbnail
    if (hoursSinceProcessed < 1) {
      return {
        shouldSkip: true,
        reason: `Recently processed ${hoursSinceProcessed.toFixed(1)}h ago with same thumbnail`,
      };
    }
  }

  // Check if optimized images already exist for same thumbnail
  let hasOptimizedImages = false;
  if (entityType === 'playlist') {
    const playlistData = existing as ExistingPlaylistData;
    hasOptimizedImages = Boolean(
      playlistData.image_webp_url && playlistData.image_avif_url
    );
  } else {
    const videoData = existing as ExistingVideoData;
    hasOptimizedImages = Boolean(
      videoData.thumbnail_webp_url && videoData.thumbnail_avif_url
    );
  }

  if (hasOptimizedImages && existing.thumbnail_url === currentThumbnailUrl) {
    return {
      shouldSkip: true,
      reason: 'Optimized images already exist for current thumbnail',
    };
  }

  return { shouldSkip: false };
}

// Generate storage paths for optimized images
function generateStoragePaths(
  entityType: string,
  entityId: string
): StoragePaths {
  const timestamp = Date.now();

  if (entityType === 'video') {
    // Videos use deterministic paths for consistency
    const basePath = `thumbnails/${entityId}/thumbnail-${entityId}`;
    return {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };
  } else if (entityType === 'playlist') {
    // Playlists use timestamped paths for multiple snapshots
    const basePath = `playlists/${entityId}/playlist-${entityId}-${timestamp}`;
    return {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };
  } else {
    // Other entities get timestamped paths
    const basePath = `${entityType}s/${entityId}/${entityType}-${entityId}-${timestamp}`;
    return {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
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
    const { data, error } = await supabase.storage
      .from(IMAGES_BUCKET)
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
  const { data: playlist, error } = await supabase
    .from('playlists')
    .select('image_properties')
    .eq('id', playlistId)
    .maybeSingle();

  if (error) {
    console.warn(`Failed to get playlist crop properties: ${error.message}`);
  }

  // Check if we have custom crop properties
  let customProperties: PlaylistImageProperties | null = null;
  const imageArea = imageWidth * imageHeight;
  const isSmallThumbnail = imageArea <= 100000;

  if (playlist?.image_properties && !isSmallThumbnail) {
    const props = playlist.image_properties as PlaylistImageProperties;
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
    limitInputPixels: false,
  });

  // Get metadata
  const metadata = await sharpInstance.metadata();
  const sourceWidth = metadata.width || 1920;
  const sourceHeight = metadata.height || 1080;

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
}

// Upload processed images to Supabase Storage
async function uploadToStorage(
  webpBuffer: Buffer,
  avifBuffer: Buffer,
  webpPath: string,
  avifPath: string
): Promise<StoragePaths> {
  // Upload WebP
  const { error: webpError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(webpPath, webpBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });

  if (webpError) {
    throw new Error(`Failed to upload WebP image: ${webpError.message}`);
  }

  // Upload AVIF
  const { error: avifError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(avifPath, avifBuffer, {
      contentType: 'image/avif',
      cacheControl: '31536000',
      upsert: true,
    });

  if (avifError) {
    throw new Error(`Failed to upload AVIF image: ${avifError.message}`);
  }

  return { webpPath, avifPath };
}

// Delete existing optimized images
async function deleteExistingOptimizedImages(
  entityType: string,
  entityId: string
): Promise<void> {
  if (entityType === 'playlist') {
    const { data: playlist, error } = await supabase
      .from('playlists')
      .select('image_webp_url, image_avif_url')
      .eq('id', entityId)
      .maybeSingle();

    if (error || !playlist) {
      return;
    }

    const filesToDelete: string[] = [];
    if (playlist?.image_webp_url) {
      filesToDelete.push(playlist.image_webp_url);
    }
    if (playlist?.image_avif_url) {
      filesToDelete.push(playlist.image_avif_url);
    }

    if (filesToDelete.length > 0) {
      await supabase.storage.from(IMAGES_BUCKET).remove(filesToDelete);
    }
  }
}

// Update database with processed image URLs
async function updateEntityWithProcessedImages(
  entityType: string,
  entityId: string,
  webpPath: string,
  avifPath: string
): Promise<void> {
  if (entityType === 'playlist') {
    const { error } = await supabase
      .from('playlists')
      .update({
        image_webp_url: webpPath,
        image_avif_url: avifPath,
        image_processing_status: 'completed',
        image_processing_updated_at: new Date().toISOString(),
      })
      .eq('id', entityId);

    if (error) {
      throw new Error(`Failed to update playlist: ${error.message}`);
    }
  } else if (entityType === 'video') {
    const { error } = await supabase
      .from('videos')
      .update({
        thumbnail_webp_url: webpPath,
        thumbnail_avif_url: avifPath,
        image_processing_status: 'completed',
        image_processing_updated_at: new Date().toISOString(),
      })
      .eq('id', entityId);

    if (error) {
      throw new Error(`Failed to update video: ${error.message}`);
    }
  }
}

// Main image processing task
export const processImageWebhook = task({
  id: 'process-image-webhook',
  // Increased timeout to 45 seconds to allow for image processing
  machine: {
    preset: 'small-1x',
  },
  // Set a longer timeout for image processing
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

    // Early validation - exit before any expensive operations
    if (!record.thumbnail_url) {
      console.log(
        `No thumbnail URL for ${entityType} ${record.id}, completing job`
      );
      if (jobId) {
        try {
          const { data: completionResult, error: completionError } =
            await supabase.rpc('complete_image_processing_job', {
              job_id: jobId,
            });
          console.log('Job completion result:', {
            completionResult,
            completionError,
          });
        } catch (error) {
          console.warn(`Failed to complete job ${jobId}:`, error);
        }
      }
      return {
        processed: false,
        reason: 'No thumbnail URL provided',
      };
    }

    // Check if recently processed to avoid unnecessary work
    console.log(`Checking recent processing for ${entityType} ${record.id}`);
    const { shouldSkip, reason: skipReason } = await checkRecentProcessing(
      entityType,
      record.id,
      record.thumbnail_url
    );

    if (shouldSkip) {
      console.log(
        `Skipping processing for ${entityType} ${record.id}: ${skipReason}`
      );
      if (jobId) {
        try {
          const { data: completionResult, error: completionError } =
            await supabase.rpc('complete_image_processing_job', {
              job_id: jobId,
            });
          console.log('Job completion result:', {
            completionResult,
            completionError,
          });
        } catch (error) {
          console.warn(`Failed to complete job ${jobId}:`, error);
        }
      }
      return {
        processed: false,
        reason: skipReason,
        skippedDuplicate: true,
      };
    }

    // Determine if we need to process based on changes
    let shouldProcess = false;
    let sourceUrl: string | null = null;

    if (type === 'INSERT') {
      // New record with thumbnail_url
      if (record.thumbnail_url) {
        shouldProcess = true;
        sourceUrl = record.thumbnail_url;
        console.log(`INSERT: Will process new ${entityType} ${record.id}`);
      }
    } else if (type === 'UPDATE') {
      // Check if thumbnail_url or image_properties changed
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
          const { data: completionResult, error: completionError } =
            await supabase.rpc('complete_image_processing_job', {
              job_id: jobId,
            });
          console.log('Job completion result:', {
            completionResult,
            completionError,
          });
        } catch (error) {
          console.warn(`Failed to complete job ${jobId}:`, error);
        }
      }
      return {
        processed: false,
        reason: 'No changes requiring processing',
      };
    }

    try {
      console.log(
        `Processing ${entityType} ${record.id} with source: ${sourceUrl}`
      );

      // Delete existing optimized images
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

      // Generate storage paths
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        record.id
      );

      // Upload to storage
      console.log(`Uploading optimized images for ${entityType} ${record.id}`);
      await uploadToStorage(webpBuffer, avifBuffer, webpPath, avifPath);
      console.log(`Uploaded images to storage:`, { webpPath, avifPath });

      // Mark job as completed if jobId provided, otherwise update directly
      if (jobId) {
        try {
          console.log(`Completing job ${jobId} with paths:`, {
            webpPath,
            avifPath,
          });
          const { data: completionResult, error: completionError } =
            await supabase.rpc('complete_image_processing_job', {
              job_id: jobId,
              webp_path: webpPath,
              avif_path: avifPath,
            });

          console.log('Job completion result:', {
            completionResult,
            completionError,
          });

          if (completionError) {
            throw new Error(
              `Job completion failed: ${completionError.message}`
            );
          }

          if (!completionResult) {
            throw new Error(
              'Job completion returned false - job may not exist or update failed'
            );
          }

          console.log(`Successfully completed job ${jobId}`);
        } catch (error) {
          console.error(`Failed to complete job ${jobId}:`, error);
          // Fallback to direct database update
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
        // No job ID, update directly
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

      // Mark job as failed if jobId provided
      if (jobId) {
        try {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.log(`Failing job ${jobId} with error: ${errorMessage}`);
          const { data: failResult, error: failError } = await supabase.rpc(
            'fail_image_processing_job',
            {
              job_id: jobId,
              error_msg: errorMessage,
            }
          );
          console.log('Job failure result:', { failResult, failError });
        } catch (failError) {
          console.error(`Failed to mark job ${jobId} as failed:`, failError);
        }
      }

      throw error;
    }
  },
});
