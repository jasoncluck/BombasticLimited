# SvelteKit Server Overload Fixes

This document outlines the changes made to remove server-side image processing
and eliminate SvelteKit server overload.

## Problem

The background image processing system was implemented, but the SvelteKit server
was still being overloaded because:

1. `getVideoThumbnailUrl()` function was routing all requests through
   `/api/video-thumbnail`
2. `/api/playlist-image` endpoint was performing real-time JPG → AVIF/WebP
   conversion
3. Server-side Sharp processing was happening during page loads instead of using
   the optimized storage fallback chain

## Solution

### 1. Updated Thumbnail URL Functions

**File: `src/lib/utils/video-thumbnails.ts`**

- `getVideoThumbnailUrl()` now returns original URLs directly instead of API
  endpoints
- `getVideoThumbnailDataUrl()` returns original URLs (marked as deprecated)
- `getVideoThumbnailProgressiveUrl()` returns original URLs (marked as
  deprecated)
- `getResponsiveVideoThumbnailUrls()` returns original URLs for all sizes

### 2. Disabled Server-Side Processing APIs

**File: `src/routes/api/video-thumbnail/+server.ts`**

- GET endpoint now redirects to original images instead of processing
- POST endpoint returns original URLs without batch processing
- Added deprecation warnings and logging

**File: `src/routes/api/playlist-image/+server.ts`**

- Disabled real-time image cropping and format conversion
- Returns redirect to original image instead of processing
- Added deprecation warnings

### 3. Updated Playlist Image Generation

**File: `src/lib/server/image-processing.ts`**

- `generatePlaylistImageUrl()` now returns original URLs directly
- Removed API parameter building that routed through server processing

## Result

### Fallback Chain Now Works Correctly

1. **Has optimized images?** → Use AVIF → WebP fallback from Supabase Storage
2. **No optimized images?** → Use original JPEG directly (no server processing)
3. **Background processing** → Inngest handles optimization asynchronously

### Performance Benefits

- ✅ **Zero server-side processing** during page loads
- ✅ **No more JPG → AVIF conversion lag**
- ✅ **Direct CDN delivery** of original images when optimized versions
  unavailable
- ✅ **SvelteKit server freed up** for actual application logic
- ✅ **Background processing system** handles optimization separately

## Component Usage

Components are already correctly implemented with the optimized storage system:

```svelte
{#if hasOptimizedImages(video)}
  <!-- Use optimized images with smart fallback chain -->
  <picture>
    {#each generatePictureSources(video) as source}
      <source srcset={source.srcset} type={source.type} />
    {/each}
    <img
      src={optimizedResult.url || getVideoThumbnailUrl(video)}
      alt={video.title}
    />
  </picture>
{:else}
  <!-- Fallback to original JPEG (no server processing) -->
  <img src={getVideoThumbnailUrl(video)} alt={video.title} />
{/if}
```

## Testing

The system now correctly:

1. **Uses optimized images** when available from background processing
2. **Falls back to original URLs** when optimized images don't exist
3. **Never processes images** on the SvelteKit server during page loads
4. **Processes images in background** via Inngest for future requests

## Migration Notes

- Existing API endpoints return deprecation warnings but remain functional for
  backward compatibility
- All image URLs now point to original sources or optimized storage, never to
  server processing endpoints
- Background processing system continues to work independently to create
  optimized images
