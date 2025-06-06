import { getInProgressVideos } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { isTimestampFilter } from "$lib/components/content/content-filter";
import { getPaginationQueryParams } from "$lib/components/content/pagination/content-pagination";

export const load: PageServerLoad = async ({
  parent,
  url,
  locals: { supabase, session },
  depends,
}) => {
  depends("supabase:db:videos");

  if (!session) {
    redirect(303, "/");
  }
  const { contentFilter, playlists } = await parent();

  if (!isTimestampFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { videos, count: videosCount } = await getInProgressVideos({
    currentPage,
    contentFilter,
    supabase,
    session,
  });

  return {
    videos: videos ?? [],
    contentFilter,
    videosCount,
    playlists,
  };
};
