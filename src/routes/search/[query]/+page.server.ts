import { isVideoFilter } from "$lib/components/content/content-filter";
import { SOURCES } from "$lib/constants/source";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";
import { searchPlaylists } from "$lib/supabase/playlists";
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

  const { playlists: playlistSearchResults } = await searchPlaylists({
    searchString,
    supabase,
  });

  for (const profilePlaylist of playlistSearchResults) {
    const transformedPlaylist = {
      ...profilePlaylist,
      image_properties: profilePlaylist.image_properties
        ? typeof profilePlaylist.image_properties === "string"
          ? JSON.parse(profilePlaylist.image_properties)
          : profilePlaylist.image_properties
        : null,
    };

    profilePlaylist.processedImageUrl = await getCroppedPlaylistImageUrlServer({
      imageProperties: transformedPlaylist.image_properties,
      thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
      thumbnailUrl: profilePlaylist.thumbnail_url,
    });
  }

  return {
    sourceVideos: sourceVideos ?? [],
    searchString,
    playlists,
    playlistSearchResults,
    contentFilter,
  };
};
