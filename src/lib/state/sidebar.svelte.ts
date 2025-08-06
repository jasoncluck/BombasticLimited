import type { Playlist } from '$lib/supabase/playlists';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { tabVisibility } from '$lib/utils/tab-visibility.js';
import { SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_MAX_AGE } from '$lib/components/ui/sidebar/constants';

export interface SidebarData {
  playlists: Playlist[];
  followedPlaylists: Playlist[];
  userProfile: UserProfile;
  userPlaylistsCount: number;
}

export interface SidebarCookieState {
  collapsed: boolean;
  defaultSize?: number;
}

export class SidebarStateClass {
  data = $state<SidebarData | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);
  #initialized = $state(false);
  #hasLoadedOnce = $state(false); // Track if we've loaded data at least once

  // Derived values for easier access
  playlists = $derived(this.data?.playlists ?? []);
  userProfile = $derived(this.data?.userProfile ?? null);
  userPlaylistsCount = $derived(this.data?.userPlaylistsCount ?? 0);

  // UI state
  collapsed = $state(false);
  openAccountDrawer = $state(false);

  // Drag and drop state
  draggedSourceIndex = $state<number | null>(null);
  targetSourceIndex = $state<number | null>(null);

  // Source ordering state
  orderedSources = $state<Source[]>([]);

  constructor() {
    // Load initial state from cookies if available
    this.loadStateFromCookie();
  }

  // Initialize effects (should be called when component is mounted)
  initializeEffects() {
    if (browser) {
      // Initialize ordered sources from user profile when data loads
      $effect(() => {
        if (this.data?.userProfile?.sources) {
          this.orderedSources = [...this.data.userProfile.sources];
        }
      });
    }
  }

  get initialized() {
    return this.#initialized;
  }

  getFollowedPlaylists(session: Session | null) {
    return (
      this.data?.playlists.filter((up) => up.created_by !== session?.user.id) ??
      []
    );
  }

  /**
   * Initialize the sidebar state. Should be called in onMount.
   * Loads initial data and sets up any necessary listeners.
   */
  initialize = async (): Promise<() => void> => {
    if (this.#initialized) {
      return () => {};
    }

    // Load initial data
    await this.loadData();
    this.#initialized = true;

    // Return cleanup function
    return () => {
      this.cleanup();
    };
  };

  /**
   * Non-blocking initialization for faster UI loading.
   * Marks as initialized immediately and loads data in background.
   */
  initializeNonBlocking = (): (() => void) => {
    if (this.#initialized) {
      return () => {};
    }

    // Mark as initialized immediately for UI purposes
    this.#initialized = true;
    this.loading = false; // Allow UI to render

    // Load data in background
    if (browser) {
      this.loadDataInBackground();
    }

    // Return cleanup function
    return () => {
      this.cleanup();
    };
  };

  // Data loading methods
  async loadData(): Promise<void> {
    if (!browser) return;

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch('/api/sidebar');
      if (response.ok) {
        this.data = await response.json();
        this.#hasLoadedOnce = true; // Mark that we've successfully loaded data
      } else {
        this.error = `Failed to load sidebar data: ${response.statusText}`;
        console.error(this.error);
      }
    } catch (error) {
      this.error = 'Failed to load sidebar';
      console.error('Failed to load sidebar:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadDataInBackground(): Promise<void> {
    if (!browser) return;

    // Don't show loading state for background loads
    this.error = null;

    try {
      const response = await fetch('/api/sidebar');
      if (response.ok) {
        this.data = await response.json();
        this.#hasLoadedOnce = true; // Mark that we've successfully loaded data
      } else {
        this.error = `Failed to load sidebar data: ${response.statusText}`;
        console.error(this.error);
      }
    } catch (error) {
      this.error = 'Failed to load sidebar';
      console.error('Failed to load sidebar:', error);
    }
  }

  addOptimisticPlaylist(playlist: Playlist): void {
    this.playlists = [...this.playlists, playlist];
  }

  removeOptimisticPlaylist(playlistId: number): void {
    this.playlists = this.playlists.filter((p) => p.id !== playlistId);
  }

  removePlaylistOptimistically(playlistId: number): Playlist | null {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (playlist) {
      this.playlists = this.playlists.filter((p) => p.id !== playlistId);
    }
    return playlist || null;
  }

  restorePlaylist(playlist: Playlist): void {
    this.playlists = [...this.playlists, playlist];
  }

  commitOptimisticPlaylist(tempId: number, realPlaylist: Playlist): void {
    const index = this.playlists.findIndex((p) => p.id === tempId);
    if (index >= 0) {
      this.playlists[index] = realPlaylist;
    }
  }

  updatePlaylistOptimistically(
    playlistId: number,
    updates: Partial<Playlist>
  ): void {
    const index = this.playlists.findIndex((p) => p.id === playlistId);
    if (index >= 0) {
      this.playlists[index] = { ...this.playlists[index], ...updates };
    }
  }
  async refreshData(): Promise<void> {
    // Only refresh if tab is visible to save resources
    if (!tabVisibility.isVisible) {
      console.log('Sidebar: Skipping refresh - tab not visible');
      return;
    }

    await this.loadData();
  }

  // Data validation helpers
  get isDataLoaded(): boolean {
    return this.data !== null && !this.loading;
  }

  get hasPlaylists(): boolean {
    return this.playlists.length > 0;
  }

  get hasError(): boolean {
    return this.error !== null;
  }

  get showPlaceholder(): boolean {
    // Only show placeholder on initial load (initialized but never loaded data successfully)
    return this.#initialized && !this.#hasLoadedOnce && !this.hasError;
  }

  // Cleanup method
  cleanup(): void {
    // Reset all state
    this.data = null;
    this.loading = false;
    this.error = null;
    this.collapsed = false;
    this.openAccountDrawer = false;
    this.orderedSources = [];
    this.#initialized = false;
    this.#hasLoadedOnce = false;
  }

  // Cookie persistence methods
  private loadStateFromCookie(): void {
    // In tests, use global.document instead of checking browser
    const doc = typeof document !== 'undefined' ? document : (global as any).document;
    if (!doc) return;

    try {
      const cookies = doc.cookie.split('; ');
      const sidebarCookie = cookies.find(c => c.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
      
      if (sidebarCookie) {
        const cookieValue = sidebarCookie.split('=')[1];
        const state: SidebarCookieState = JSON.parse(decodeURIComponent(cookieValue));
        
        this.collapsed = state.collapsed;
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from cookie:', error);
    }
  }

  saveStateToCookie(collapsed?: boolean, defaultSize?: number): void {
    // In tests, use global.document instead of checking browser
    const doc = typeof document !== 'undefined' ? document : (global as any).document;
    if (!doc) return;

    try {
      const state: SidebarCookieState = {
        collapsed: collapsed ?? this.collapsed,
        ...(defaultSize !== undefined && { defaultSize })
      };

      const cookieValue = encodeURIComponent(JSON.stringify(state));
      doc.cookie = `${SIDEBAR_COOKIE_NAME}=${cookieValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    } catch (error) {
      console.warn('Failed to save sidebar state to cookie:', error);
    }
  }

  // Get the default size from cookie
  getDefaultSizeFromCookie(): number | undefined {
    // In tests, use global.document instead of checking browser
    const doc = typeof document !== 'undefined' ? document : (global as any).document;
    if (!doc) return undefined;

    try {
      const cookies = doc.cookie.split('; ');
      const sidebarCookie = cookies.find(c => c.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
      
      if (sidebarCookie) {
        const cookieValue = sidebarCookie.split('=')[1];
        const state: SidebarCookieState = JSON.parse(decodeURIComponent(cookieValue));
        return state.defaultSize;
      }
    } catch (error) {
      console.warn('Failed to read default size from cookie:', error);
    }

    return undefined;
  }

  // Update collapsed state and save to cookie
  setCollapsed(collapsed: boolean, defaultSize?: number): void {
    this.collapsed = collapsed;
    this.saveStateToCookie(collapsed, defaultSize);
  }
}

// Export the class type for use elsewhere
export type SidebarState = SidebarStateClass;

const DEFAULT_KEY = '$_sidebar_state';

export function setSidebarState(key = DEFAULT_KEY) {
  const sidebarState = new SidebarStateClass();
  return setContext(key, sidebarState);
}

export function getSidebarState(key = DEFAULT_KEY) {
  return getContext<SidebarState>(key);
}
