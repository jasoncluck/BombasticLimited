# Background Image Processing System

This directory contains the implementation of a background image processing
system that replaces server-side Sharp processing with Inngest background jobs
and Supabase Storage for optimal image delivery.

## Overview

The system provides:

- **Background Processing**: Images are processed asynchronously using Inngest
- **Optimized Formats**: Generates WebP and AVIF formats for 70-80% smaller file
  sizes
- **Smart Fallbacks**: Progressive enhancement (AVIF → WebP → JPEG)
- **CDN Delivery**: Static file delivery via Supabase Storage instead of data
  URLs
- **No Page Load Lag**: Images are processed in background after upload

## Architecture

### Components

1. **Inngest Functions** (`src/lib/inngest/image-processing.ts`)
   - `processImage`: Process individual image
   - `batchProcessImages`: Process multiple images
   - `cleanupFailedJobs`: Clean up old/failed jobs

2. **Storage Utilities** (`src/lib/utils/video-thumbnails-storage.ts`)
   - Smart format detection and fallback chain
   - URL generation for optimized images
   - Queue management for processing jobs

3. **Database Migration**
   (`supabase/migrations/20250114000000_image_processing_system.sql`)
   - Storage path columns for WebP/AVIF images
   - Job queue table for background processing
   - Database functions for job management

4. **API Endpoint** (`src/routes/api/inngest/+server.ts`)
   - Serves Inngest functions via SvelteKit

### Workflow

1. **Video/Playlist Creation**:
   - Original thumbnails saved to database
   - Background processing jobs queued via Inngest

2. **Background Processing**:
   - Inngest downloads original image
   - Processes into WebP and AVIF formats
   - Uploads to Supabase Storage
   - Updates database with storage paths

3. **Image Delivery**:
   - Components check for optimized images
   - Use `<picture>` elements for format fallback
   - Fall back to original processing if needed

## Usage

### Queueing Processing Jobs

```typescript
import { queueVideoImageProcessing } from '$lib/utils/video-thumbnails-storage';

// Queue processing for a video
await queueVideoImageProcessing(
  videoId,
  thumbnailUrl,
  thumbnailMaxresUrl,
  priority
);
```

### Using Optimized Images in Components

```svelte
<script>
  import {
    getOptimizedImageUrl,
    generatePictureSources,
    hasOptimizedImages,
  } from '$lib/utils/video-thumbnails-storage';
</script>

{#if hasOptimizedImages(video)}
  {@const pictureSources = generatePictureSources(video)}
  {@const optimizedResult = getOptimizedImageUrl(video)}
  <picture>
    {#each pictureSources as source}
      <source srcset={source.srcset} type={source.type} />
    {/each}
    <img src={optimizedResult.url} alt={video.title} />
  </picture>
{:else}
  <!-- Fallback to original system -->
  <img src={getVideoThumbnailUrl(video)} alt={video.title} />
{/if}
```

### CLI Scripts

Process existing images:

```bash
npm run script:process-existing-images
npm run script:process-existing-images --dry-run
npm run script:process-existing-images --videos --force
```

Test the system:

```bash
npm run script:test-image-processing
```

## Configuration

### Environment Variables

Required for production:

```env
# Supabase
PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Inngest (production)
INNGEST_SIGNING_KEY=your_signing_key
```

### Supabase Storage

The system requires a `optimized-images` bucket in Supabase Storage:

- Public access enabled
- Allowed MIME types: `image/webp`, `image/avif`
- File size limit: 10MB

## Performance Benefits

- **70-80% smaller file sizes** compared to JPEG
- **No server processing lag** during page loads
- **Better caching** with static file delivery
- **CDN delivery** instead of data URL generation
- **Progressive enhancement** for modern browsers

## Database Schema

### New Columns Added

Videos and Playlists tables:

- `thumbnail_webp_path` - Storage path for WebP thumbnail
- `thumbnail_avif_path` - Storage path for AVIF thumbnail
- `thumbnail_maxres_webp_path` - Storage path for WebP max-res thumbnail
- `thumbnail_maxres_avif_path` - Storage path for AVIF max-res thumbnail
- `image_processing_status` - Processing status ('pending', 'processing',
  'completed', 'failed')
- `image_processing_updated_at` - Last processing update timestamp

### Job Queue Table

`image_processing_jobs`:

- Tracks background processing tasks
- Includes retry logic and error handling
- Supports priority-based processing

## Monitoring

- Check `image_processing_jobs` table for processing status
- Monitor Inngest dashboard for job execution
- Use CLI scripts to validate processing pipeline

## Migration Strategy

1. Deploy database migration
2. Set up Supabase Storage bucket
3. Deploy Inngest endpoint
4. Process existing images with CLI script
5. Monitor processing queue and performance

The system maintains full backward compatibility - unprocessed images continue
to use the existing Sharp-based system until optimized versions are available.
