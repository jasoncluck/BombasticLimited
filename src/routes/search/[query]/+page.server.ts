import { isVideoFilter } from "$lib/components/content/content-filter";
import { SOURCES } from "$lib/constants/source";
import { getVideos, type SourceVideos } from "$lib/supabase/videos";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  params,
  parent,
  locals: { supabase, session },
  depends,
}) => {
  depends("supabase:db:videos");

  const { contentFilter, playlists } = await parent();
  const searchString = params.query;
  const sourceVideos: SourceVideos = {
    giantbomb: [],
    nextlander: [],
    remap: [],
  };

  if (!isVideoFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  for (const source of SOURCES) {
    const { videos } = await getVideos({
      source,
      contentFilter,
      searchString,
      supabase,
      session,
    });
    sourceVideos[source] = videos;
  }

  // TODO: Add public playlists results to search results
  return {
    sourceVideos: sourceVideos ?? [],
    playlists,
    contentFilter,
  };
};
