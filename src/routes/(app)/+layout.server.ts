import type { ContentView } from '$lib/components/content/content';
import { getFilterOptionFromQueryParams } from '$lib/components/content/content-filter';
import { getProfile } from '$lib/supabase/user-profiles';
import { MAIN_ROUTES } from '$lib/constants/routes';
import type { LayoutServerLoad } from './$types';
import { loadFlash } from 'sveltekit-flash-message/server';
import { detectOptimalImageFormat } from '$lib/supabase/images';

export const load: LayoutServerLoad = loadFlash(
  async ({
    locals: { supabase },
    request,
    cookies,
    url,
    isDataRequest,
    setHeaders,
    depends,
  }) => {
    depends('supabase:db:profiles');

    const claimsPromise = supabase.auth.getClaims();

    const preferredImageFormat = detectOptimalImageFormat(
      request.headers.get('Accept') ?? 'image/*'
    );

    let view: ContentView;
    if (url.pathname === MAIN_ROUTES.CONTINUE) {
      view = 'continueWatching';
    } else if (/^\/playlist\//.test(url.pathname)) {
      view = 'playlist';
    } else if (/^\/search\//.test(url.pathname)) {
      view = 'search';
    } else {
      view = 'default';
    }

    const contentFilter = getFilterOptionFromQueryParams({
      searchParams: url.searchParams,
      view,
    });

    const { data: claimsData } = await claimsPromise;

    // Simple cache headers for static assets only
    if (!isDataRequest && !url.pathname.startsWith('/api/')) {
      try {
        const cacheControl = claimsData?.claims
          ? 'private, max-age=300, must-revalidate'
          : 'public, max-age=600, s-maxage=1200';

        setHeaders({
          'cache-control': cacheControl,
          vary: 'Authorization, Cookie',
        });
      } catch {
        // Headers already set
      }
    }

    const [{ profile: userProfile }] = await Promise.all([
      getProfile({
        supabase,
      }),
    ]);

    return {
      claims: claimsData?.claims,
      contentFilter,
      cookies: cookies.getAll(),
      userProfile,
      preferredImageFormat,
    };
  }
);
