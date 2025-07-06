import { getPaginationQueryParams } from "$lib/components/pagination/pagination";
import { DEFAULT_NUM_PLAYLISTS_PAGINATION, getPlaylistsForUsername } from "$lib/supabase/playlists";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  url,
  locals: { supabase, session },
}) => {
  depends("supabase:db:playlistsForUser")


  const username = params.username


  const { playlists } = await parent();

  const followedPlaylists = playlists.filter((p) => p.created_by !== session?.user.id)

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { playlists: playlistsForUsername, count: playlistsCount } = await getPlaylistsForUsername({ username, limit: DEFAULT_NUM_PLAYLISTS_PAGINATION, currentPage, supabase });

  return {
    playlistsForUsername,
    playlists,
    playlistsCount,
    currentPage,
    followedPlaylists,
  };
};
