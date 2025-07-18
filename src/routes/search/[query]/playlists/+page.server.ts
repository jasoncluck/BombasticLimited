import { page } from "$app/state";
import { getPaginationQueryParams } from "$lib/components/pagination/pagination";
import {
  DEFAULT_NUM_PLAYLISTS_PAGINATION,
  searchPlaylists,
} from "$lib/supabase/playlists";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  parent,
  depends,
  params,
  url,
  locals: { supabase, session },
}) => {
  depends("supabase:db:playlistsForProfile");

  const { playlists } = await parent();

  const followedPlaylists = playlists.filter(
    (p) => p.created_by !== session?.user.id,
  );

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
    });
  return {
    playlistResults,
    playlistsCount,
    playlists,
    currentPage,
    followedPlaylists,
  };
};
