import { getPaginationQueryParams } from "$lib/components/pagination/pagination";
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from "$lib/supabase/playlists";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  depends,
  params,
  url,
  locals: { supabase, session },
}) => {
  depends("supabase:db:playlistsForProfile");

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const searchString = params.query;

  const { playlists: playlistResults, count: playlistsCount } =
    await searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_PAGINATION,
      currentPage,
      supabase,
      session,
    });
  return {
    playlistResults,
    playlistsCount,
    currentPage,
  };
};
