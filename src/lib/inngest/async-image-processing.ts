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
 *
 * Path Generation Strategy:
 * - Videos: Use deterministic paths WITHOUT timestamps for consistent naming
 *   This prevents duplicate processing of the same video uploaded at different times
 * - Playlists: Use timestamp-based paths to support multiple snapshots over time
 *   Each playlist processing represents a snapshot at a specific point in time
 */
export function generateStoragePaths(
  entityType: string,
  entityId: string,
  imageType: string,
  jobId?: string,
  workerId?: string
): { webpPath: string; avifPath: string } {
  console.log(
    `📂 Worker ${workerId || 'unknown'} generating storage paths for ${entityType}/${entityId}/${imageType} (job: ${jobId})`
  );

  if (entityType === 'video') {
    // Videos use completely deterministic paths WITHOUT any timestamps, job IDs, or worker IDs
    // This ensures the same video always generates the same file paths, preventing duplicates
    if (imageType === 'thumbnail') {
      const basePath = `thumbnails/${entityId}/thumbnail-${entityId}`;
      const paths = {
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };

      console.log(
        `📂 Worker ${workerId || 'unknown'} video thumbnail paths generated (deterministic, no timestamps) - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
      );

      return paths;
    } else {
      // Fallback for other video image types - still deterministic
      const basePath = `thumbnails/${entityId}/${entityId}-${imageType}`;
      const paths = {
        webpPath: `${basePath}.webp`,
        avifPath: `${basePath}.avif`,
      };

      console.log(
        `📂 Worker ${workerId || 'unknown'} video fallback paths generated (deterministic, no timestamps) - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
      );

      return paths;
    }
  } else if (entityType === 'playlist') {
    // Playlists use timestamped paths to support multiple snapshots over time
    const timestamp = Date.now();
    const uniqueSuffix = jobId
      ? `${timestamp}-${jobId.slice(0, 8)}`
      : timestamp.toString();
    const basePath = `playlists/${entityId}/playlist-${entityId}-${uniqueSuffix}`;
    const paths = {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };

    console.log(
      `📂 Worker ${workerId || 'unknown'} playlist paths generated (with timestamp) - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
    );

    return paths;
  } else {
    // Other entities get timestamped paths for uniqueness
    const timestamp = Date.now();
    const uniqueSuffix = jobId
      ? `${timestamp}-${jobId.slice(0, 8)}`
      : timestamp.toString();
    const basePath = `${entityType}s/${entityId}/${entityType}-${entityId}-${uniqueSuffix}`;
    const paths = {
      webpPath: `${basePath}.webp`,
      avifPath: `${basePath}.avif`,
    };

    console.log(
      `📂 Worker ${workerId || 'unknown'} fallback paths generated (with timestamp) - webp: ${paths.webpPath}, avif: ${paths.avifPath}`
    );

    return paths;
  }
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
      .maybeSingle();

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
 * Get playlist crop properties using the new dynamic crop calculation system
 */
async function getPlaylistCropProperties(
  playlistId: string,
  imageWidth: number,
  imageHeight: number
): Promise<PlaylistImageProperties> {
  console.log(
    `🎯 Calculating smart dynamic crop for playlist ${playlistId} (${imageWidth}x${imageHeight})`
  );

  // Analyze image characteristics
  const imageArea = imageWidth * imageHeight;
  const aspectRatio = imageWidth / imageHeight;
  const isSmallThumbnail = imageArea <= 100000; // ~320x313 or smaller
  const isVerySmallThumbnail = imageArea <= 60000; // ~320x188 or smaller (YouTube default)
  const isMaxRes = imageWidth === 1280 && imageHeight === 720;
  const isStandardYouTube = imageWidth === 320 && imageHeight === 180;

  console.log(
    `📊 Image analysis: area=${imageArea}, aspectRatio=${aspectRatio.toFixed(2)}, small=${isSmallThumbnail}, verySmall=${isVerySmallThumbnail}, maxRes=${isMaxRes}, standardYT=${isStandardYouTube}`
  );

  // Get playlist image_properties from database
  const { data: playlist, error } = await supabase
    .from('playlists')
    .select('image_properties')
    .eq('id', playlistId)
    .single();

  if (error) {
    console.warn(`Failed to get playlist crop properties: ${error.message}`);
  }

  // Check if we have custom crop properties from the database
  let customProperties: PlaylistImageProperties | null = null;
  if (playlist?.image_properties && !isSmallThumbnail) {
    // Only use custom properties for larger images to avoid over-cropping small thumbnails
    const props = playlist.image_properties as PlaylistImageProperties;
    // Validate the properties have required fields
    if (
      typeof props.x === 'number' &&
      typeof props.y === 'number' &&
      typeof props.width === 'number' &&
      typeof props.height === 'number'
    ) {
      customProperties = props;
      console.log(
        `📋 Using custom crop properties for playlist ${playlistId}:`,
        customProperties
      );
    }
  } else if (playlist?.image_properties && isSmallThumbnail) {
    console.log(
      `⚠️ Ignoring custom crop properties for small thumbnail to prevent over-cropping`
    );
  }

  // Use size-aware crop calculation
  let cropProperties: PlaylistImageProperties;

  if (isVerySmallThumbnail) {
    // For very small thumbnails (like YouTube 320x180), use minimal cropping
    console.log(`🔍 Applying conservative crop for very small thumbnail`);
    cropProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop
      null // Force dynamic calculation, ignore custom properties
    );
  } else if (isSmallThumbnail) {
    // For small thumbnails, use moderate cropping
    console.log(`🔍 Applying moderate crop for small thumbnail`);
    cropProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop
      null // Force dynamic calculation for consistency
    );
  } else if (isMaxRes) {
    // For max resolution images, use custom properties if available
    console.log(`🔍 Applying crop for max resolution image`);
    cropProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop
      customProperties // Use custom properties for high-res images
    );
  } else {
    // For other sizes, use standard dynamic calculation
    console.log(`🔍 Applying standard dynamic crop`);
    cropProperties = calculateDynamicCropDimensions(
      imageWidth,
      imageHeight,
      true, // Prefer square crop
      customProperties // Use custom properties if available
    );
  }

  // Calculate crop percentage for logging
  const cropArea = cropProperties.width * cropProperties.height;
  const originalArea = imageWidth * imageHeight;
  const cropPercentage = ((cropArea / originalArea) * 100).toFixed(1);

  console.log(
    `✨ Calculated smart crop properties: x=${cropProperties.x}, y=${cropProperties.y}, w=${cropProperties.width}, h=${cropProperties.height} (${cropPercentage}% of original)`
  );

  return cropProperties;
}

/**
 * **HIGH-QUALITY** image processing with aggressive compression and advanced optimization
 */
async function processImageFormats(
  buffer: Buffer,
  entityType?: string,
  playlistId?: string,
  sourceUrl?: string
): Promise<{ webp: Buffer; avif: Buffer }> {
  console.log(
    '🎨 Starting HIGH-QUALITY image processing with aggressive compression...'
  );

  const sharpInstance = sharp(buffer, {
    failOnError: false,
    density: 300,
    limitInputPixels: false,
  });

  // Get metadata
  const metadata = await sharpInstance.metadata();
  const sourceWidth = metadata.width || 1920;
  const sourceHeight = metadata.height || 1080;

  console.log(
    `📐 Source image: ${sourceWidth}x${sourceHeight}, ${metadata.format}, ${Math.round((metadata.size || 0) / 1024)}KB`
  );

  let pipeline = sharpInstance;
  let finalOutputSize = {
    width: sourceWidth,
    height: sourceHeight,
  };

  if (entityType === 'playlist' && playlistId && sourceUrl) {
    // Use the new dynamic crop system
    const cropProps = await getPlaylistCropProperties(
      playlistId,
      sourceWidth,
      sourceHeight
    );

    // Validate and adjust crop dimensions using the enhanced function
    const imageType =
      sourceWidth === 1280 && sourceHeight === 720 ? 'maxres' : 'standard';
    const validatedCropProps = validateAndAdjustCropDimensions(
      cropProps,
      sourceWidth,
      sourceHeight,
      imageType,
      null // This comes from getPlaylistCropProperties which already handles custom properties
    );

    console.log(
      `🎯 Applying validated crop: x=${validatedCropProps.x}, y=${validatedCropProps.y}, w=${validatedCropProps.width}, h=${validatedCropProps.height}`
    );

    pipeline = pipeline.extract({
      left: validatedCropProps.x,
      top: validatedCropProps.y,
      width: validatedCropProps.width,
      height: validatedCropProps.height,
    });

    // Determine output size based on crop size for better compression
    const cropSize = Math.min(
      validatedCropProps.width,
      validatedCropProps.height
    );
    let outputSize: number;

    if (cropSize <= 180) {
      outputSize = 256; // Smaller output for small crops
    } else if (cropSize <= 360) {
      outputSize = 512; // Medium output
    } else {
      outputSize = 768; // Larger output but still compressed
    }

    finalOutputSize = { width: outputSize, height: outputSize };

    pipeline = pipeline
      .resize(outputSize, outputSize, {
        fit: 'cover',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({
        sigma: 0.8, // Reduced sharpening for better compression
        m1: 1.0,
        m2: 1.8,
        x1: 2.0,
        y2: 8.0,
        y3: 15.0,
      });
  } else {
    // For non-playlist images, apply smart resizing for compression
    const maxDimension = Math.max(sourceWidth, sourceHeight);
    let targetSize: number;

    if (maxDimension > 1920) {
      targetSize = 1920; // 4x compression for very large images
    } else if (maxDimension > 1280) {
      targetSize = 1280; // 3x compression for large images
    } else if (maxDimension > 640) {
      targetSize = 640; // 2x compression for medium images
    } else {
      targetSize = maxDimension; // Keep original size for small images
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

  // Apply color space conversion for better compression
  pipeline = pipeline.toColourspace('srgb');

  const pixelCount = finalOutputSize.width * finalOutputSize.height;
  const isLargeImage = pixelCount > 300000; // Lowered threshold

  // Aggressive compression settings - much lower quality for smaller file sizes
  const webpQuality = isLargeImage ? 65 : 75; // Reduced from 92/95
  const avifQuality = isLargeImage ? 55 : 65; // Reduced from 85/88

  const result: { webp: Buffer; avif: Buffer } = {
    webp: Buffer.alloc(0),
    avif: Buffer.alloc(0),
  };

  console.log(`🔄 Generating COMPRESSED WebP (quality: ${webpQuality})...`);
  result.webp = await pipeline
    .clone()
    .webp({
      quality: webpQuality,
      effort: 6, // Max effort for best compression
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      preset: 'photo',
      alphaQuality: 80, // Reduced alpha quality
    })
    .toBuffer();

  console.log(`🔄 Generating COMPRESSED AVIF (quality: ${avifQuality})...`);
  result.avif = await pipeline
    .clone()
    .avif({
      quality: avifQuality,
      effort: 9, // Max effort for best compression
      lossless: false,
      chromaSubsampling: '4:2:0', // More aggressive chroma subsampling
    })
    .toBuffer();

  const webpCompressionRatio = metadata.size
    ? ((result.webp.length / metadata.size) * 100).toFixed(1)
    : 'N/A';
  const avifCompressionRatio = metadata.size
    ? ((result.avif.length / metadata.size) * 100).toFixed(1)
    : 'N/A';

  console.log(`📊 Compression results:`);
  console.log(`   Original: ${Math.round((metadata.size || 0) / 1024)}KB`);
  console.log(
    `   WebP: ${Math.round(result.webp.length / 1024)}KB (${webpCompressionRatio}% of original)`
  );
  console.log(
    `   AVIF: ${Math.round(result.avif.length / 1024)}KB (${avifCompressionRatio}% of original)`
  );

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
      cacheControl: '31536000',
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
 * Enhanced with worker identification and better concurrency control
 */
export const processImage = inngest.createFunction(
  {
    id: 'process-image-hq',
    name: 'Process Single Image (High Quality)',
    timeouts: { start: '2m', finish: '4m' },
    retries: MAX_RETRIES,
    // ENHANCED: Use entity+imageType combination for concurrency control
    // This prevents the same video+imageType from being processed multiple times
    // even if duplicate jobs somehow exist with different job IDs
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
      workerId,
      pollingTimestamp,
      jobAttempts,
      processingStartedAt,
    } = event.data;
    const startTime = Date.now();

    console.log(
      `🚀 Worker ${workerId || 'unknown'} starting HIGH-QUALITY processing with AGGRESSIVE COMPRESSION for ${entityType} ${entityId}, type: ${imageType}, job: ${jobId}`
    );
    console.log(
      `📋 Job context - worker: ${workerId}, attempts: ${jobAttempts}/3, polled at: ${pollingTimestamp}, processing started: ${processingStartedAt}`
    );
    console.log(
      `🔒 Concurrency key: ${entityType}-${entityId}-${imageType} (prevents duplicate processing of same content)`
    );

    console.log(`📸 Source URL: ${sourceUrl}`);

    try {
      // Ensure we have both job ID and worker ID - these should always be provided by the enhanced poller
      if (!jobId) {
        const errorMsg =
          'No job ID provided - jobs should be created by database triggers and locked by poller';
        console.error(
          `❌ Worker ${workerId || 'unknown'} CRITICAL ERROR: ${errorMsg}`
        );
        throw new Error(errorMsg);
      }

      if (!workerId) {
        const errorMsg =
          'No worker ID provided - worker identification is required to prevent race conditions';
        console.error(`❌ CRITICAL ERROR: ${errorMsg}`);

        throw new Error(errorMsg);
      }

      console.log(
        `🔄 Worker ${workerId} processing job ${jobId} (already locked by poller)...`
      );

      // The job is already marked as processing by the atomic poller function
      // No need to call start_image_processing_job again
      const markingDuration = Date.now() - startTime;

      console.log(
        `✅ Worker ${workerId} job ${jobId} already locked and processing in ${markingDuration}ms`
      );

      // Check existing images
      const existingCheckStart = Date.now();
      const { hasWebP, hasAVIF } = await checkExistingOptimizedImages(
        entityType,
        entityId
      );
      const existingCheckDuration = Date.now() - existingCheckStart;

      console.log(
        `🔍 Worker ${workerId} existing images check completed in ${existingCheckDuration}ms - WebP: ${hasWebP}, AVIF: ${hasAVIF} - generating NEW compressed versions`
      );

      // Delete existing images before creating new ones
      if (hasWebP || hasAVIF) {
        const deleteStart = Date.now();
        await deleteExistingOptimizedImages(entityType, entityId);
        const deleteDuration = Date.now() - deleteStart;

        console.log(
          `🗑️ [${new Date().toISOString()}] Worker ${workerId} deleted existing images in ${deleteDuration}ms`
        );
      } else {
        console.log(
          `ℹ️ [${new Date().toISOString()}] Worker ${workerId} no existing images to delete`
        );
      }

      // Download source image
      console.log(
        `📥 [${new Date().toISOString()}] Worker ${workerId} downloading source image from: ${sourceUrl}`
      );
      const downloadStart = Date.now();
      const imageBuffer = await downloadImage(sourceUrl);
      const downloadDuration = Date.now() - downloadStart;
      console.log(
        `✅ [${new Date().toISOString()}] Worker ${workerId} downloaded ${Math.round(imageBuffer.length / 1024)}KB in ${downloadDuration}ms`
      );

      // Process image with HIGH QUALITY settings and AGGRESSIVE COMPRESSION
      console.log(
        `🎨 [${new Date().toISOString()}] Worker ${workerId} starting HIGH-QUALITY image processing with AGGRESSIVE COMPRESSION...`
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
        `✅ [${new Date().toISOString()}] Worker ${workerId} image processing completed in ${processDuration}ms (WebP: ${Math.round(webpBuffer.length / 1024)}KB, AVIF: ${Math.round(avifBuffer.length / 1024)}KB)`
      );

      // Generate storage paths with job and worker context
      console.log(
        `📂 [${new Date().toISOString()}] Worker ${workerId} generating storage paths...`
      );

      const pathStart = Date.now();
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        entityId,
        imageType,
        jobId,
        workerId
      );
      const pathDuration = Date.now() - pathStart;

      console.log(
        `📂 [${new Date().toISOString()}] Worker ${workerId} storage paths generated in ${pathDuration}ms`
      );

      // Upload to storage
      console.log(
        `📤 [${new Date().toISOString()}] Worker ${workerId} uploading optimized images to storage...`
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
        `✅ [${new Date().toISOString()}] Worker ${workerId} upload completed in ${uploadDuration}ms`
      );

      // Mark job as completed using the enhanced worker-aware function
      console.log(
        `🏁 [${new Date().toISOString()}] Worker ${workerId} marking job ${jobId} as completed...`
      );
      const completeStart = Date.now();
      const { error: completeError } = await supabase.rpc(
        'complete_image_processing_job_with_worker',
        {
          job_id: jobId,
          p_worker_id: workerId,
          webp_path: uploadResult.webpPath,
          avif_path: uploadResult.avifPath,
        }
      );
      const completeDuration = Date.now() - completeStart;

      if (completeError) {
        const errorMsg = `Failed to complete job ${jobId}: ${completeError.message}`;
        console.error(
          `❌ [${new Date().toISOString()}] Worker ${workerId} ${errorMsg}`
        );
        throw new Error(errorMsg);
      }

      const totalProcessingTime = Date.now() - startTime;

      console.log(
        `🎉 [${new Date().toISOString()}] Worker ${workerId} successfully processed HIGH-QUALITY COMPRESSED image for ${entityType} ${entityId} in ${totalProcessingTime}ms (job: ${jobId})`
      );
      console.log(
        `📊 [${new Date().toISOString()}] Worker ${workerId} processing breakdown - existing check: ${existingCheckDuration}ms, download: ${downloadDuration}ms, processing: ${processDuration}ms, upload: ${uploadDuration}ms, completion: ${completeDuration}ms`
      );

      return {
        webpPath: uploadResult.webpPath,
        avifPath: uploadResult.avifPath,
      };
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      const totalErrorTime = Date.now() - startTime;

      console.error(
        `❌ [${errorTimestamp}] Worker ${workerId || 'unknown'} failed to process HIGH-QUALITY COMPRESSED image for ${entityType} ${entityId} (job: ${jobId}) after ${totalErrorTime}ms:`,
        error
      );

      // Mark the job as failed using the enhanced worker-aware function
      if (jobId && workerId) {
        try {
          console.log(
            `🔄 [${new Date().toISOString()}] Worker ${workerId} marking job ${jobId} as failed...`
          );
          const failStart = Date.now();

          await supabase.rpc('fail_image_processing_job_with_worker', {
            job_id: jobId,
            p_worker_id: workerId,
            error_msg: error instanceof Error ? error.message : String(error),
          });

          const failDuration = Date.now() - failStart;

          console.log(
            `❌ [${new Date().toISOString()}] Worker ${workerId} marked job ${jobId} as failed in ${failDuration}ms`
          );
        } catch (jobError) {
          console.error(
            `💥 [${new Date().toISOString()}] Worker ${workerId} failed to mark job ${jobId} as failed:`,
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
 *
 * DEPRECATED: This function is now primarily used for backward compatibility.
 * New jobs should be created via database triggers and processed by the job poller system.
 *
 * This function still exists to support any legacy direct calls, but the preferred
 * approach is to create database jobs using queue_image_processing_job() which will
 * be picked up by the job poller and sent to the individual processImage function.
 */
export const batchProcessImages = inngest.createFunction(
  {
    id: 'batch-process-images-hq',
    name: 'Batch Process Images (High Quality) - DEPRECATED',
    concurrency: process.env.NODE_ENV === 'development' ? 1 : 3,
  },
  { event: 'image.batch.process' },
  async ({ event }) => {
    const { jobs } = event.data;

    console.log(
      `⚠️ DEPRECATED: Batch processing ${jobs.length} images via direct Inngest call. Consider using database jobs instead.`
    );

    const results = [];

    // Convert legacy batch jobs to individual image.process events
    // The individual processImage function will handle worker ID validation
    for (const job of jobs) {
      try {
        await inngest.send({
          name: 'image.process',
          data: {
            ...job,
            // Note: These jobs won't have workerId, pollingTimestamp, etc.
            // which may cause them to fail. This is intentional to encourage
            // migration to the database job system.
            jobId: null, // No database job ID for legacy calls
            workerId: null, // No worker ID for legacy calls
            pollingTimestamp: null,
            jobAttempts: 1,
            processingStartedAt: new Date().toISOString(),
          },
        });
        results.push({ success: true, entityId: job.entityId });
      } catch (error) {
        console.error(
          `❌ Failed to queue processing for ${job.entityType} ${job.entityId}:`,
          error
        );
        results.push({
          success: false,
          entityId: job.entityId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(
      `🎯 DEPRECATED batch processing completed: ${successful} successful, ${failed} failed`
    );

    return {
      totalJobs: jobs.length,
      successful,
      failed,
      results,
      warning:
        'This batch processing method is deprecated. Use database jobs instead.',
    };
  }
);

/**
 * Cleanup stale processing jobs and old failed jobs
 * Enhanced to handle worker-specific cleanup
 */
export const cleanupStaleJobs = inngest.createFunction(
  {
    id: 'cleanup-stale-jobs',
    name: 'Cleanup Stale Processing Jobs',
  },
  { event: 'image.cleanup.stale' },
  async ({ event }) => {
    const {
      staleThresholdMinutes = 30,
      cleanupFailedJobs = true,
      olderThanHours = 24,
    } = event.data;

    console.log(
      `🧹 Starting cleanup - stale jobs older than ${staleThresholdMinutes} minutes, failed jobs older than ${olderThanHours} hours`
    );

    let staleJobsReset = 0;
    let failedJobsDeleted = 0;

    try {
      // Reset stale processing jobs
      const { data: staleResetData, error: staleError } = await supabase.rpc(
        'cleanup_stale_processing_jobs',
        { stale_threshold_minutes: staleThresholdMinutes }
      );

      if (staleError) {
        console.error('Failed to cleanup stale jobs:', staleError);
      } else {
        staleJobsReset = staleResetData || 0;
        console.log(
          `✅ Reset ${staleJobsReset} stale processing jobs back to pending`
        );
      }

      // Cleanup old failed jobs if requested
      if (cleanupFailedJobs) {
        const cutoffTime = new Date(
          Date.now() - olderThanHours * 60 * 60 * 1000
        ).toISOString();

        const { data: failedData, error: failedError } = await supabase
          .from('image_processing_jobs')
          .delete()
          .eq('status', 'failed')
          .lt('updated_at', cutoffTime)
          .select();

        if (failedError) {
          console.error('Failed to cleanup failed jobs:', failedError);
        } else {
          failedJobsDeleted = failedData?.length || 0;
          console.log(`✅ Deleted ${failedJobsDeleted} old failed jobs`);
        }
      }

      console.log(
        `✅ Cleanup completed: ${staleJobsReset} stale jobs reset, ${failedJobsDeleted} failed jobs deleted`
      );

      return {
        staleJobsReset,
        failedJobsDeleted,
        success: true,
      };
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw new Error(
        `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);

import { pollPendingJobs } from './async-image-processing/job_poller';
import {
  calculateDynamicCropDimensions,
  validateAndAdjustCropDimensions,
} from '$lib/utils/dynamic-crop-dimensions';

// Export all functions
export const imageFunctions = [
  processImage,
  batchProcessImages,
  cleanupStaleJobs,
  pollPendingJobs,
];
