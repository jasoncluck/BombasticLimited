import {
  processVideoThumbnails,
  type VideoWithProcessedThumbnail,
} from './video-thumbnail-service';
import type { Video } from '$lib/supabase/videos';

/**
 * Process videos for a list/grid view efficiently
 * This is useful when rendering multiple videos at once (like in content tiles)
 */
export async function processVideosForDisplay(
  videos: Video[]
): Promise<VideoWithProcessedThumbnail[]> {
  return processVideoThumbnails(videos);
}

/**
 * Hook to use in Svelte components for processing videos
 * Returns a reactive store-like object that updates when processing completes
 */
export function useVideoThumbnailProcessing(videos: Video[]) {
  let processedVideos: VideoWithProcessedThumbnail[] = $state([]);
  let isProcessing = $state(true);
  let error = $state<Error | null>(null);

  // Process videos when the input changes
  $effect(() => {
    if (videos.length === 0) {
      processedVideos = [];
      isProcessing = false;
      return;
    }

    isProcessing = true;
    error = null;

    processVideoThumbnails(videos)
      .then((processed) => {
        processedVideos = processed;
        isProcessing = false;
      })
      .catch((err) => {
        console.error('Failed to process video thumbnails:', err);
        error = err;
        // Fallback to original videos without processed thumbnails
        processedVideos = videos.map((video) => ({
          ...video,
          processedThumbnailUrl: null,
        }));
        isProcessing = false;
      });
  });

  return {
    get processedVideos() {
      return processedVideos;
    },
    get isProcessing() {
      return isProcessing;
    },
    get error() {
      return error;
    },
  };
}
