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
import type { CombinedContentFilter } from '$lib/components/content/content-filter';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { ImageFormat } from '$lib/utils/image-format-detection';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
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

  let session = null;

  const { data: sessionData } = await supabase.auth.getSession();
  session = sessionData.session;

  // Destructure the simplified data without complex caching
  const {
    userProfile = null,
    contentFilter,
    preferredImageFormat,
  }: {
    userProfile?: UserProfile | null;
    contentFilter?: CombinedContentFilter;
    preferredImageFormat: ImageFormat;
  } = data;

  return {
    session,
    supabase,
    contentFilter: contentFilter || null,
    userProfile,
    preferredImageFormat,
    isSidebarCollapsed: false, // Simplified - no complex layout parsing
  };
};
