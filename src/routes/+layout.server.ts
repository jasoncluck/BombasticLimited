import type { ContentView } from '$lib/components/content/content';
import { getFilterOptionFromQueryParams } from '$lib/components/content/content-filter';
import { getProfile } from '$lib/supabase/user-profiles';
import { MAIN_ROUTES } from '$lib/constants/routes.js';
import type { LayoutServerLoad } from './$types';

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

  let layout = cookies.get('PaneForge:layout');
  let layoutPanes = undefined;
  let isSidebarCollapsed = false;
  
  if (layout) {
    try {
      const parsed = JSON.parse(layout);
      
      // Handle new unified format
      if (parsed && typeof parsed === 'object' && parsed.panes && Array.isArray(parsed.panes)) {
        layoutPanes = parsed.panes;
        isSidebarCollapsed = parsed.sidebarCollapsed ?? false;
      }
      // Handle legacy format (just array of numbers)  
      else if (Array.isArray(parsed)) {
        layoutPanes = parsed;
        isSidebarCollapsed = false; // Default to expanded for legacy
      }
    } catch {
      layoutPanes = undefined;
      isSidebarCollapsed = false;
    }
  }

  const { session } = await sessionPromise;

  // Simplified cache strategy - single cache validation approach
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

  const { profile: userProfile } = await getProfile({
    session,
    supabase,
  });

  return {
    session,
    contentFilter,
    cookies: cookies.getAll(),
    userProfile,
    layout: layoutPanes,
    isSidebarCollapsed,
    etag,
    lastModified: lastModified.toISOString(),
    cached: isCacheHit,
    cacheUserId: userId,
  };
};
