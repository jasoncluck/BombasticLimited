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
import type { CombinedContentFilter } from '$lib/components/content/content-filter';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { NotificationWithMeta } from '$lib/supabase/notifications';

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

  // Destructure the simplified data without complex caching
  const {
    userProfile = null,
    contentFilter,
  }: {
    userProfile?: UserProfile | null;
    contentFilter?: CombinedContentFilter;
  } = data;

  return {
    session,
    supabase,
    contentFilter: contentFilter || null,
    userProfile,
    isSidebarCollapsed: false, // Simplified - no complex layout parsing
  };
};
