import { browser } from '$app/environment';
import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
    // Preload images for the first 10 videos
    const videosToPreload = data.videos.slice(0, DEFAULT_PRELOAD_VIDEOS_LIST);

    videosToPreload.forEach((video) => {
      if (video.image_url) {
        new Image().src = video.image_url;
      } else {
        new Image().src = video.thumbnail_url;
      }
    });
  }

  return data;
};
