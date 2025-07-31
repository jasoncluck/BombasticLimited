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
import type { CombinedContentFilter } from "$lib/components/content/content-filter";
import type { UserProfile } from "$lib/supabase/user-profiles";

export const load = async ({
  data,
  depends,
  fetch,
}: Parameters<LayoutLoad>[0]) => {
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

  const {
    playlistsCount,
    userProfile,
    layout,
    contentFilter,
  }: {
    playlistsCount?: number | null;
    userProfile: UserProfile | null;
    layout?: string;
    contentFilter: CombinedContentFilter;
  } = data;

  // Handle layout safely
  let parsedLayout: number[] | null = null;
  if (layout) {
    try {
      // If it's already an array, use it directly
      if (Array.isArray(layout)) {
        parsedLayout = layout.every(
          (item) => typeof item === "number" && !isNaN(item),
        )
          ? layout
          : null;
      }
      // If it's a string, try to parse it
      else if (typeof layout === "string") {
        const parsed = JSON.parse(layout);
        parsedLayout =
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "number" && !isNaN(item))
            ? parsed
            : null;
      }
    } catch (error) {
      console.warn("Failed to process layout:", layout, error);
      parsedLayout = null;
    }
  }

  return {
    session,
    supabase,
    contentFilter,
    userProfile,
    user,
    playlistsCount,
    layout: parsedLayout,
    isSidebarCollapsed:
      parsedLayout && Math.trunc(parsedLayout[0]) === COLLAPSED_SIDEBAR_SIZE
        ? true
        : false,
  };
};
