import { browser } from '$app/environment';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
    // Preload images
    const videosToPreload = data.videos.slice(0, 10);

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
