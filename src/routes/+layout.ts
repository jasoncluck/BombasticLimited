import {
  createBrowserClient,
  createServerClient,
  isBrowser,
} from '@supabase/ssr';
import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from '$env/static/public';
import type { LayoutLoad } from './$types';
import { COLLAPSED_SIDEBAR_SIZE } from '$lib/constants/layout';
import type {
  CombinedContentFilter,
  VideoFilter,
} from '$lib/components/content/content-filter';
import type { UserProfile } from '$lib/supabase/user-profiles';

export const load = async ({
  data,
  depends,
  fetch,
}: Parameters<LayoutLoad>[0]) => {
  /**
   * Declare a dependency so the layout can be invalidated, for example, on
   * session refresh.
   */
  depends('supabase:auth');

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
            return data.cookies || [];
          },
          setAll() {
            // Server-side cookie setting is handled by the server load function
            // This is a no-op for the client load function
          },
        },
      });

  /**
   * Use `getClaims` for enhanced security by validating JWT claims directly.
   * If getClaims is not available, fall back to getSession.
   */
  let session = null;
  try {
    const { data, error } = await supabase.auth.getClaims();

    if (!error && data?.claims) {
      // If claims are valid, get the session
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData.session;
    }
  } catch (error) {
    // Fallback to getSession if getClaims is not available
    console.warn('getClaims not available, falling back to getSession:', error);
    const { data } = await supabase.auth.getSession();
    session = data.session;
  }

  // Handle the case where server returns minimal cached data
  if (data.cached) {
    return {
      session,
      supabase,
      playlistsCount: null as number | null,
      contentFilter: {
        sort: { key: 'datePublished', order: 'descending' },
        type: 'video',
      } as VideoFilter,
      userProfile: null as UserProfile | null,
      isSidebarCollapsed: false,
      // Cache-related data from server
      etag: data.etag || null,
      lastModified: data.lastModified || null,
      cached: true,
      cacheUserId: data.cacheUserId || null,
    };
  }

  // Destructure the full data when not cached with proper types
  const {
    playlistsCount = null,
    userProfile = null,
    layout = null,
    contentFilter,
    etag = null,
    lastModified = null,
    cacheUserId = null,
  }: {
    playlistsCount?: number | null;
    userProfile?: UserProfile | null;
    layout?: string | number[] | null;
    contentFilter?: CombinedContentFilter;
    etag?: string | null;
    lastModified?: string | null;
    cacheUserId?: string | null;
  } = data;

  // Handle layout safely
  let parsedLayout: number[] | null = null;
  if (layout) {
    try {
      // If it's already an array, use it directly
      if (Array.isArray(layout)) {
        parsedLayout = layout.every(
          (item) => typeof item === 'number' && !isNaN(item)
        )
          ? layout
          : null;
      }
      // If it's a string, try to parse it
      else if (typeof layout === 'string') {
        const parsed = JSON.parse(layout);
        parsedLayout =
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === 'number' && !isNaN(item))
            ? parsed
            : null;
      }
    } catch (error) {
      console.warn('Failed to process layout:', layout, error);
      parsedLayout = null;
    }
  }

  return {
    session,
    supabase,
    contentFilter: contentFilter || null,
    userProfile,
    playlistsCount,
    layout: parsedLayout,
    isSidebarCollapsed:
      parsedLayout && Math.trunc(parsedLayout[0]) === COLLAPSED_SIDEBAR_SIZE
        ? true
        : false,
    // Cache-related data from server
    etag,
    lastModified,
    cached: false,
    cacheUserId,
  };
};
