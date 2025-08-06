# Video Thumbnail WebP Processing

This feature converts video thumbnails from YouTube (and other sources) to WebP
format for better performance and smaller file sizes, while preserving the
original aspect ratio.

## Features

- **WebP Conversion**: Converts JPG thumbnails to WebP format with 80% quality
- **Aspect Ratio Preservation**: Unlike playlist images, video thumbnails are
  NOT cropped
- **Client & Server Processing**: Works both in browser and on server-side
- **Caching**: Automatically caches processed thumbnails to avoid reprocessing
- **Batch Processing**: Efficiently processes multiple thumbnails at once
- **Fallback**: Falls back to original thumbnail if processing fails

## Usage

### Individual Video Processing

```typescript
import {
  processVideoThumbnail,
  getVideoThumbnailUrl,
} from '$lib/components/video/video-thumbnail-service';

// Process a single video
const processedVideo = await processVideoThumbnail(video);
const thumbnailUrl = getVideoThumbnailUrl(processedVideo);
```

### Batch Processing

```typescript
import { processVideoThumbnails } from '$lib/components/video/video-thumbnail-service';

// Process multiple videos efficiently
const processedVideos = await processVideoThumbnails(videos);
```

### In Svelte Components

```svelte
<script>
  import {
    processVideoThumbnail,
    getVideoThumbnailUrl,
  } from '$lib/components/video/video-thumbnail-service';
  import { onMount } from 'svelte';

  let { video } = $props();
  let videoWithThumbnail = $state();

  onMount(() => {
    processVideoThumbnail(video).then((processed) => {
      videoWithThumbnail = processed;
    });
  });
</script>

<img
  src={videoWithThumbnail
    ? getVideoThumbnailUrl(videoWithThumbnail)
    : video.thumbnail_url}
  alt={video.title}
/>
```

### Using the Display Utils Hook

```svelte
<script>
  import { useVideoThumbnailProcessing } from '$lib/components/video/video-display-utils';

  let { videos } = $props();
  const { processedVideos, isProcessing, error } =
    useVideoThumbnailProcessing(videos);
</script>

{#if isProcessing}
  <div>Processing thumbnails...</div>
{:else if error}
  <div>Error processing thumbnails: {error.message}</div>
{:else}
  {#each processedVideos as video}
    <img src={getVideoThumbnailUrl(video)} alt={video.title} />
  {/each}
{/if}
```

## Implementation Details

### Server-side Processing

- Uses Sharp library for high-quality WebP conversion
- No cropping - preserves original aspect ratio
- 80% quality with effort level 4 for performance balance

### Client-side Processing

- Uses OffscreenCanvas when available for better performance
- Falls back to regular Canvas API
- Same quality settings as server-side

### Caching Strategy

- In-memory cache prevents reprocessing the same thumbnail URL
- Cache includes both successful and failed processing attempts
- Use `clearThumbnailCache()` to clear cache if needed

### Error Handling

- Gracefully falls back to original thumbnail URLs on processing errors
- Logs errors for debugging
- Caches failures to avoid retrying broken URLs

## Components Updated

- `content-card.svelte`: Video thumbnails in tile view
- `content-table-image.svelte`: Video thumbnails in table view

Both components now automatically use WebP processed thumbnails with fallback to
original URLs.

## Testing

The implementation includes comprehensive tests:

- 12 server-side processing tests
- 11 client-side processing tests
- 15 video thumbnail service tests
- Total: 38 tests covering all functionality

Run tests with:

```bash
npm run test:unit src/lib/server/__tests__/image-processing.test.ts
npm run test:unit src/lib/components/playlist/__tests__/playlist-service.test.ts
npm run test:unit src/lib/components/video/__tests__/video-thumbnail-service.test.ts
```

## Performance Impact

- **Positive**: Smaller file sizes and better compression with WebP
- **Neutral**: Processing happens asynchronously and is cached
- **Minimal**: Fallback ensures no blocking if processing fails

The implementation is designed to enhance performance without impacting user
experience.
