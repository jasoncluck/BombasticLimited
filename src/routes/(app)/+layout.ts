import { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import { browser } from '$app/environment';
import { PUBLIC_NEON_DATA_API_URL } from '$env/static/public';
import type { LayoutLoad } from './$types';
import type { CombinedContentFilter } from '$lib/components/content/content-filter';
import type { UserProfile } from '$lib/neon/user-profiles';
import type { ImageFormat } from '$lib/utils/image-format-detection';
import type { AppSession } from '$lib/types/session';
import type { Database } from '$lib/neon/database.types';
import { ID_TOKEN_CLIENT_COOKIE } from '$lib/constants/auth-cookies';

function getClientIdToken(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ID_TOKEN_CLIENT_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
  depends('app:profile');

  // Only the browser instance is ever actually queried (this universal load
  // reruns client-side right after hydration) — the readable ID-token
  // mirror cookie only exists for the browser to read, so the server-side
  // instance here is effectively inert and stays unauthenticated.
  const idToken = browser ? getClientIdToken() : null;

  const neon = new NeonPostgrestClient<Database>({
    dataApiUrl: PUBLIC_NEON_DATA_API_URL,
    options: {
      global: {
        fetch,
        ...(idToken && { headers: { Authorization: `Bearer ${idToken}` } }),
      },
    },
  });

  const {
    userId,
    userProfile = null,
    contentFilter,
    preferredImageFormat,
  }: {
    userId?: string | null;
    userProfile?: UserProfile | null;
    contentFilter?: CombinedContentFilter;
    preferredImageFormat: ImageFormat;
  } = data;

  const session: AppSession | null = userId ? { user: { id: userId } } : null;

  return {
    session,
    neon,
    contentFilter: contentFilter || null,
    userProfile,
    preferredImageFormat,
    isSidebarCollapsed: false, // Simplified - no complex layout parsing
  };
};
