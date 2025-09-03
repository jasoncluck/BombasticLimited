import { browser } from '$app/environment';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
    // Preload first 5 videos of source
    const videosToPreload = data.videos.slice(0, 5);

    videosToPreload.forEach((video) => {
      if (video.image_url) {
        new Image().src = video.image_url;
      } else {
        new Image().src = video.thumbnail_url;
      }
    });

    // Preload first 5 images of highlighted playlists
    for (const highlightPlaylist of data.highlightPlaylists) {
      const videosToPreload = highlightPlaylist.videos.slice(0, 5);
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
