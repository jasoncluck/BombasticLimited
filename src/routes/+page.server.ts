import type {
  TimestampFilter,
  VideoFilter,
} from "$lib/components/content/content-filter";
import { SOURCES } from "$lib/constants/source";
import {
  DEFAULT_NUM_VIDEOS_OVERVIEW,
  getInProgressVideos,
  getVideos,
  type SourceVideos,
} from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  parent,
  locals: { supabase, session },
  url,
  depends,
}) => {
  depends("supabase:db:videos");

  const { playlists } = await parent();

  if (url.searchParams.has("error")) {
    redirect(303, "/auth/error");
  }

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
      limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
      contentFilter: sourceVideosDataFilters,
      supabase,
      session,
    });
    sourceVideos[source] = videos;
    console.log(videos);
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
    limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
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
