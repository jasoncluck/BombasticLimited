import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { DEFAULT_PRELOAD_VIDEOS_CAROUSEL } from '$lib/supabase/videos';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
    let source: Source;

    for (const playlist of data.playlistSearchResults) {
      if (playlist.image_url) {
        new Image().src = playlist.image_url;
      }
    }

    for (source in data.sourceVideos) {
      const videosToPreload = data.sourceVideos[source].slice(
        0,
        DEFAULT_PRELOAD_VIDEOS_CAROUSEL
      );
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
