import {
  createBrowserClient,
  createServerClient,
  isBrowser,
} from "@supabase/ssr";
import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public";
import type { LayoutLoad } from "./$types";
import { COLLAPSED_SIDEBAR_SIZE } from "$lib/constants/layout";
import type { Playlist } from "$lib/supabase/playlists";
import type { CombinedContentFilter } from "$lib/components/content/content-filter";
import { goto } from "$app/navigation";

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
  /**
   * Declare a dependency so the layout can be invalidated, for example, on
   * session refresh.
   */
  depends("supabase:auth");

  const supabase = isBrowser()
    ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: {
          fetch,
        },
      })
    : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: {
          fetch,
        },
        cookies: {
          getAll() {
            return data.cookies;
          },
        },
      });

  /**
   * It's fine to use `getSession` here, because on the client, `getSession` is
   * safe, and on the server, it reads `session` from the `LayoutData`, which
   * safely checked the session using `safeGetSession`.
   */
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  supabase.auth.onAuthStateChange((event, session) => {
    console.log(event);
    console.log(session);
    console.log(session?.user?.user_metadata.username);
    if (
      isBrowser() &&
      event === "INITIAL_SESSION" &&
      session &&
      !session?.user?.user_metadata.username
    ) {
      goto("/auth/username");
    }
  });

  const {
    playlists,
    playlistsCount,
    layout,
    contentFilter,
  }: {
    playlists: Playlist[];
    playlistsCount?: number | null;
    layout?: string;
    contentFilter: CombinedContentFilter;
  } = data;

  return {
    session,
    supabase,
    contentFilter,
    user,
    playlists,
    playlistsCount,
    layout,
    isSidebarCollapsed:
      layout && Math.trunc(parseFloat(layout[0])) === COLLAPSED_SIDEBAR_SIZE
        ? true
        : false,
  };
};
