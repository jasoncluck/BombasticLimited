import type { ContentView } from '$lib/components/content/content';
import { getFilterOptionFromQueryParams } from '$lib/components/content/content-filter';
import { getProfile } from '$lib/supabase/user-profiles';
import { MAIN_ROUTES } from '$lib/constants/routes.js';
import type { LayoutServerLoad } from './$types';
import { getNotifications } from '$lib/supabase/notifications';

export const load: LayoutServerLoad = async ({
  locals: { safeGetSession, supabase },
  cookies,
  url,
  isDataRequest,
  setHeaders,
  depends,
  request,
}) => {
  depends('supabase:db:profiles');
  depends('supabase:db:notifications');

  const sessionPromise = safeGetSession();

  let view: ContentView;
  if (url.pathname === MAIN_ROUTES.CONTINUE) {
    view = 'continueWatching';
  } else if (/^\/playlist\//.test(url.pathname)) {
    view = 'playlist';
  } else {
    view = 'default';
  }

  const contentFilter = getFilterOptionFromQueryParams({
    searchParams: url.searchParams,
    view,
  });

  const { session } = await sessionPromise;

  //Single cache validation approach
  const userId = session?.user?.id || null;
  const timeSlot = Math.floor(Date.now() / 600000); // 10 minute slots

  // Simple cache key based on path and time
  const cacheKey = `${url.pathname}-${userId || 'anon'}-${timeSlot}`;
  const etag = `"${cacheKey}"`;
  const lastModified = new Date(timeSlot * 600000);

  const clientEtag = request.headers.get('if-none-match');

  // Basic cache headers only
  if (!isDataRequest) {
    try {
      const cacheControl = session
        ? 'private, max-age=300, must-revalidate'
        : 'public, max-age=600, s-maxage=1200';

      setHeaders({
        etag: etag,
        'last-modified': lastModified.toUTCString(),
        'cache-control': cacheControl,
        vary: 'Authorization, Cookie',
      });
    } catch {
      // Headers already set
    }
  }

  const isCacheHit = clientEtag === etag;

  const [{ profile: userProfile }, { data: notifications }] = await Promise.all(
    [
      getProfile({
        session,
        supabase,
      }),

      getNotifications({ supabase, session }),
    ]
  );

  return {
    session,
    contentFilter,
    cookies: cookies.getAll(),
    userProfile,
    etag,
    lastModified: lastModified.toISOString(),
    cached: isCacheHit,
    cacheUserId: userId,
    notifications,
  };
};
