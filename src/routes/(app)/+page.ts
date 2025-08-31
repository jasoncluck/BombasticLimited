import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
    let source: Source;
    for (source in data.sourceVideos) {
      const videosToPreload = data.sourceVideos[source].slice(0, 5);
      videosToPreload.forEach((video) => {
        if (video.image_url) {
          new Image().src = video.image_url;
        } else {
          new Image().src = video.thumbnail_url;
        }
      });
    }
  }

  return data;
};
