import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({
  browser: true,
}));

vi.mock('$lib/state/notifications.svelte', () => ({
  showToast: vi.fn(),
}));

import { SidebarStateClass } from '../sidebar.svelte';

// Regression test for a bug where the Twitch "live" indicator (and the
// TwitchEmbed on a source page) never appeared on initial page load: the
// non-blocking init path (initializeNonBlocking -> loadDataInBackground)
// was a second, duplicated implementation of loadData() that fetched
// /api/sidebar correctly but never called updateStreamingSources(), so
// `streamingSources` stayed stuck at [] until the next periodic refresh
// (up to 2 minutes later) happened to go through the *other*, correct
// loadData() path instead.
describe('SidebarStateClass streaming sources', () => {
  let sidebarState: SidebarStateClass;

  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = '';
    localStorage.clear();

    sidebarState = new SidebarStateClass();
    sidebarState.preferredImageFormat = 'webp';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          playlists: [],
          followedPlaylists: [],
          userProfile: null,
          userPlaylistsCount: 0,
          streamingSources: ['giantbomb', 'minnmax'],
        }),
    });
  });

  it('loadData populates streamingSources from the API response', async () => {
    await sidebarState.loadData();

    expect(sidebarState.isSourceStreaming('giantbomb')).toBe(true);
    expect(sidebarState.isSourceStreaming('jeffgerstmann')).toBe(false);
  });

  it('loadDataInBackground (the initial non-blocking load path) also populates streamingSources', async () => {
    await sidebarState.loadDataInBackground();

    expect(sidebarState.isSourceStreaming('giantbomb')).toBe(true);
    expect(sidebarState.isSourceStreaming('minnmax')).toBe(true);
    expect(sidebarState.isSourceStreaming('nextlander')).toBe(false);
  });
});
