import type {
  TimestampFilter,
  VideoFilter,
} from "$lib/components/content/content-filter";
import { SOURCES } from "$lib/constants/source";
import {
  getInProgressVideos,
  getVideos,
  type SourceVideos,
} from "$lib/supabase/videos";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  parent,
  locals: { supabase, session },
  depends,
}) => {
  depends("supabase:db:videos");

  const { playlists } = await parent();

  const NUM_CAROUSEL_VIDEOS = 30;

  const sourceVideos: SourceVideos = {
    giantbomb: [],
    nextlander: [],
    remap: [],
  };

  const sourceVideosDataFilters: VideoFilter = {
    sort: {
      key: "datePublished",
      order: "descending",
    },
    type: "video",
  };

  for (const source of SOURCES) {
    const { videos } = await getVideos({
      source,
      limit: NUM_CAROUSEL_VIDEOS,
      contentFilter: sourceVideosDataFilters,
      supabase,
      session,
    });
    sourceVideos[source] = videos;
  }

  const continueWatchingDataFilters: TimestampFilter = {
    sort: {
      key: "dateTimestamp",
      order: "descending",
    },
    type: "timestamp",
  };

  const { videos: continueWatchingVideos } = await getInProgressVideos({
    contentFilter: continueWatchingDataFilters,
    limit: NUM_CAROUSEL_VIDEOS,
    supabase,
    session,
  });

  return {
    sourceVideos,
    sourceVideosDataFilters,
    continueWatchingVideos,
    continueWatchingDataFilters,
    playlists,
  };
};
