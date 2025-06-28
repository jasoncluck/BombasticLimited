import { isSource, type Source } from "$lib/constants/source";
import { DEFAULT_NUM_VIDEOS_OVERVIEW, getVideos } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "../[source]/$types";
import { isVideoFilter } from "$lib/components/content/content-filter";

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  locals: { supabase, session },
}) => {
  depends("supabase:db:videos");

  if (!isSource(params.source)) {
    redirect(303, "/");
  }

  const { contentFilter } = await parent();

  if (!isVideoFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  const { videos } = await getVideos({
    source: params.source as Source,
    session,
    limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
    contentFilter,
    supabase,
  });

  return {
    videos: videos ?? [],
    source: params.source,
    contentFilter,
  };
};
