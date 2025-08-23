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
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Configuration constants
const STORAGE_BUCKET = IMAGES_BUCKET;
const PROCESSING_TIMEOUT = 60000;

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
}

// Generate storage paths for optimized images
function generateStoragePaths(
  entityType: string,
  entityId: string
): { webpPath: string; avifPath: string } {
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
    .single();

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
): Promise<{ webp: Buffer; avif: Buffer }> {
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

  const result: { webp: Buffer; avif: Buffer } = {
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
): Promise<{ webpPath: string; avifPath: string }> {
  // Upload WebP
  const { error: webpError } = await supabase.storage
    .from(STORAGE_BUCKET)
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
    .from(STORAGE_BUCKET)
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
      await supabase.storage.from(STORAGE_BUCKET).remove(filesToDelete);
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
        updated_at: new Date().toISOString(),
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
        updated_at: new Date().toISOString(),
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
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: WebhookPayload) => {
    const { type, table, record, old_record } = payload;

    console.log(`Processing ${type} webhook for ${table} ${record.id}`);

    // Determine if we need to process
    let shouldProcess = false;
    let sourceUrl: string | null = null;

    if (type === 'INSERT') {
      // New record with thumbnail_url
      if (record.thumbnail_url) {
        shouldProcess = true;
        sourceUrl = record.thumbnail_url;
      }
    } else if (type === 'UPDATE') {
      // Check if thumbnail_url or image_properties changed
      const thumbnailChanged =
        record.thumbnail_url !== old_record?.thumbnail_url;
      const imagePropertiesChanged =
        table === 'playlists' &&
        JSON.stringify(record.image_properties) !==
          JSON.stringify(old_record?.image_properties);

      if (thumbnailChanged || imagePropertiesChanged) {
        shouldProcess = true;
        sourceUrl = record.thumbnail_url || null;
      }
    }

    if (!shouldProcess || !sourceUrl) {
      console.log(`No processing needed for ${table} ${record.id}`);
      return { processed: false, reason: 'No changes requiring processing' };
    }

    try {
      const entityType = table === 'playlists' ? 'playlist' : 'video';

      // Delete existing optimized images
      await deleteExistingOptimizedImages(entityType, record.id);

      // Download source image
      console.log(`Downloading image from: ${sourceUrl}`);
      const imageBuffer = await downloadImage(sourceUrl);

      // Process image
      console.log(`Processing image for ${entityType} ${record.id}`);
      const { webp: webpBuffer, avif: avifBuffer } = await processImageFormats(
        imageBuffer,
        entityType,
        entityType === 'playlist' ? record.id : undefined,
        sourceUrl
      );

      // Generate storage paths
      const { webpPath, avifPath } = generateStoragePaths(
        entityType,
        record.id
      );

      // Upload to storage
      console.log(`Uploading optimized images for ${entityType} ${record.id}`);
      await uploadToStorage(webpBuffer, avifBuffer, webpPath, avifPath);

      // Update database
      await updateEntityWithProcessedImages(
        entityType,
        record.id,
        webpPath,
        avifPath
      );

      console.log(
        `Successfully processed image for ${entityType} ${record.id}`
      );

      return {
        processed: true,
        entityType,
        entityId: record.id,
        webpPath,
        avifPath,
        webpSize: Math.round(webpBuffer.length / 1024),
        avifSize: Math.round(avifBuffer.length / 1024),
      };
    } catch (error) {
      console.error(
        `Failed to process image for ${table} ${record.id}:`,
        error
      );
      throw error;
    }
  },
});
