import type { Playlist } from '$lib/supabase/playlists';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { Session } from '@supabase/supabase-js';
import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { SOURCE_INFO } from '$lib/constants/source';
import { showToast } from '$lib/state/notifications.svelte';
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
} from '$lib/components/ui/sidebar/constants';
import type { ImageFormat } from '$lib/utils/image-format-detection';
import debounce from 'debounce';
import { SvelteSet } from 'svelte/reactivity';

export interface SidebarData {
  playlists: Playlist[];
  followedPlaylists: Playlist[];
  userProfile: UserProfile;
  userPlaylistsCount: number;
  streamingSources: Source[];
}

export interface SidebarCookieState {
  collapsed: boolean;
  defaultSize?: number;
}

/**
 * Sidebar configuration interface (from layout pattern)
 */
export interface SidebarConfig {
  searchDebounceMs: number;
}

/**
 * Sidebar state interface (following layout pattern)
 */
export interface SidebarState {
  // Core data state
  data: SidebarData | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // UI State (from layout)
  isDraggingDivider: boolean;
  isSidebarCollapsed: boolean;

  // Sidebar state properties
  collapsed: boolean;
  openAccountDrawer: boolean;

  // Derived values
  playlists: Playlist[];
  userProfile: UserProfile | null;
  userPlaylistsCount: number;
  streamingSources: Source[];

  // Drag and drop state
  draggedSourceIndex: number | null;
  targetSourceIndex: number | null;

  // Source ordering state
  orderedSources: Source[];

  // Configuration
  config: SidebarConfig;

  // Context update method
  updateContext: (updates: {
    preferredImageFormat?: ImageFormat | null;
  }) => void;

  // Sidebar methods (from layout)
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Cookie methods
  saveStateToCookie: (collapsed: boolean, defaultSize?: number) => void;
  getDefaultSizeFromCookie: () => number | undefined;
  setCollapsed: (collapsed: boolean, defaultSize?: number) => void;
  toggleCollapsed: () => void;

  // Data methods
  loadData: () => Promise<void>;
  loadDataInBackground: () => Promise<void>;
  refreshData: () => Promise<void>;
  initialize: (
    preferredImageFormat?: ImageFormat | null
  ) => Promise<() => void>;
  initializeNonBlocking: (
    preferredImageFormat?: ImageFormat | null
  ) => () => void;
  initializeEffects: () => void;

  // Streaming methods
  updateStreamingSources: (sources: Source[]) => void;
  isSourceStreaming: (source: Source) => boolean;
  getStreamingSources: () => Source[];

  // Utility methods
  getFollowedPlaylists: (session: Session | null) => Playlist[];

  // Validation helpers
  isDataLoaded: boolean;
  hasPlaylists: boolean;
  hasError: boolean;
  showPlaceholder: boolean;

  // Test helpers
  setInitialStreamLoadFlag: (value: boolean) => void;
  getInitialStreamLoadFlag: () => boolean;

  // Cleanup method
  cleanup: () => void;
}

// Key for localStorage to track shown notifications
const SHOWN_NOTIFICATIONS_KEY = 'bombastic_shown_stream_notifications';
// How long to remember a notification was shown (24 hours)
const NOTIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Interface for tracking shown notifications
 */
interface ShownNotification {
  source: Source;
  timestamp: number;
}

/**
 * Get shown notifications from localStorage
 */
function getShownNotifications(): ShownNotification[] {
  if (!browser) return [];

  try {
    const stored = localStorage.getItem(SHOWN_NOTIFICATIONS_KEY);
    if (!stored) return [];

    const notifications: ShownNotification[] = JSON.parse(stored);
    const now = Date.now();

    // Filter out expired notifications
    const validNotifications = notifications.filter(
      (notification) => now - notification.timestamp < NOTIFICATION_EXPIRY_MS
    );

    // Save back if we filtered any out
    if (validNotifications.length !== notifications.length) {
      localStorage.setItem(
        SHOWN_NOTIFICATIONS_KEY,
        JSON.stringify(validNotifications)
      );
    }

    return validNotifications;
  } catch (error) {
    console.error('Failed to load shown notifications:', error);
    return [];
  }
}

export class SidebarStateClass implements SidebarState {
  data = $state<SidebarData | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);
  #initialized = $state(false);
  #hasLoadedOnce = $state(false); // Track if we've loaded data at least once

  // UI State (from layout pattern)
  isDraggingDivider = $state(false);
  isSidebarCollapsed = $state(false);

  // Sidebar state properties
  collapsed = $state(false);
  openAccountDrawer = $state(false);

  // Preferred image format - now properly reactive and initialized from server
  preferredImageFormat = $state<ImageFormat | null>(null);

  // Derived values for easier access
  playlists = $derived(this.data?.playlists ?? []);
  userProfile = $derived(this.data?.userProfile ?? null);
  userPlaylistsCount = $derived(this.data?.userPlaylistsCount ?? 0);
  streamingSources = $state<Source[]>([]);

  // Drag and drop state
  draggedSourceIndex = $state<number | null>(null);
  targetSourceIndex = $state<number | null>(null);

  // Source ordering state
  orderedSources = $state<Source[]>([]);

  // Track initial stream load for notification logic
  #isInitialStreamLoad = $state(true);

  // Configuration (from layout pattern)
  config = $state<SidebarConfig>({
    searchDebounceMs: 350,
  });

  constructor() {
    // Initialize sidebar state from cookie on construction
    this.loadStateFromCookie();
    // Also initialize sidebar collapsed state from localStorage (from layout pattern)
    this.loadSidebarStateFromLocalStorage();
  }

  /**
   * Update context (called by parent components)
   */
  updateContext(updates: { preferredImageFormat?: ImageFormat | null }): void {
    const formatChanged =
      updates.preferredImageFormat !== this.preferredImageFormat;

    if (updates.preferredImageFormat !== undefined) {
      this.preferredImageFormat = updates.preferredImageFormat;
    }

    // If format was just set for the first time and we haven't loaded data yet, load it now
    if (
      formatChanged &&
      this.preferredImageFormat &&
      !this.#hasLoadedOnce &&
      this.#initialized
    ) {
      this.loadDataInBackground();
    }
  }

  /**
   * Load sidebar state from localStorage (from layout pattern)
   */
  private loadSidebarStateFromLocalStorage(): void {
    if (!browser) return;

    try {
      const saved = localStorage.getItem('bombastic-sidebar-collapsed');
      if (saved !== null) {
        this.isSidebarCollapsed = JSON.parse(saved);
        // Also sync with the collapsed state for consistency
        this.collapsed = this.isSidebarCollapsed;
      }
    } catch (error) {
      console.error('Failed to load sidebar state from localStorage:', error);
    }
  }

  /**
   * Save sidebar state to localStorage (from layout pattern)
   */
  private saveSidebarStateToLocalStorage(collapsed: boolean): void {
    if (!browser) return;

    try {
      localStorage.setItem(
        'bombastic-sidebar-collapsed',
        JSON.stringify(collapsed)
      );
    } catch (error) {
      console.error('Failed to save sidebar state to localStorage:', error);
    }
  }

  /**
   * Load sidebar state from cookie
   */
  private loadStateFromCookie(): void {
    // In tests, check if document exists instead of browser flag
    if (typeof document === 'undefined') return;

    try {
      const cookies = document.cookie.split(';');
      const sidebarCookie = cookies.find((cookie) =>
        cookie.trim().startsWith(`${SIDEBAR_COOKIE_NAME}=`)
      );

      if (sidebarCookie) {
        const cookieValue = sidebarCookie.split('=')[1];
        const state: SidebarCookieState = JSON.parse(
          decodeURIComponent(cookieValue)
        );
        this.collapsed = state.collapsed ?? false;
      }
    } catch (error) {
      console.error('Failed to load sidebar state from cookie:', error);
      this.collapsed = false; // Default to expanded if cookie is malformed
    }
  }

  /**
   * Save sidebar state to cookie
   */
  saveStateToCookie(collapsed: boolean, defaultSize?: number): void {
    // In tests, check if document exists instead of browser flag
    if (typeof document === 'undefined') return;

    const state: SidebarCookieState = { collapsed };
    if (defaultSize !== undefined) {
      state.defaultSize = defaultSize;
    }

    const cookieValue = encodeURIComponent(JSON.stringify(state));
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${cookieValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  }

  /**
   * Get default size from cookie
   */
  getDefaultSizeFromCookie(): number | undefined {
    // In tests, check if document exists instead of browser flag
    if (typeof document === 'undefined') return undefined;

    try {
      const cookies = document.cookie.split(';');
      const sidebarCookie = cookies.find((cookie) =>
        cookie.trim().startsWith(`${SIDEBAR_COOKIE_NAME}=`)
      );

      if (sidebarCookie) {
        const cookieValue = sidebarCookie.split('=')[1];
        const state: SidebarCookieState = JSON.parse(
          decodeURIComponent(cookieValue)
        );
        return state.defaultSize;
      }
    } catch (error) {
      console.error('Failed to get default size from cookie:', error);
    }

    return undefined;
  }

  /**
   * Set collapsed state and save to cookie
   */
  setCollapsed(collapsed: boolean, defaultSize?: number): void {
    this.collapsed = collapsed;
    this.saveStateToCookie(collapsed, defaultSize);
  }

  /**
   * Toggle collapsed state
   */
  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
  }

  /**
   * Sidebar methods (from layout pattern)
   */
  setSidebarCollapsed = (collapsed: boolean): void => {
    this.isSidebarCollapsed = collapsed;
    this.collapsed = collapsed; // Keep both states in sync
    this.saveSidebarStateToLocalStorage(collapsed);
    this.saveStateToCookie(collapsed);
  };

  toggleSidebar = (): void => {
    this.setSidebarCollapsed(!this.isSidebarCollapsed);
  };

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
   * Record that a notification was shown
   */
  private recordShownNotification(source: Source): void {
    if (!browser) return;

    try {
      const shownNotifications = getShownNotifications();
      shownNotifications.push({
        source,
        timestamp: Date.now(),
      });

      localStorage.setItem(
        SHOWN_NOTIFICATIONS_KEY,
        JSON.stringify(shownNotifications)
      );
    } catch (error) {
      console.error('Failed to record shown notification:', error);
    }
  }

  /**
   * Check if a notification was recently shown for this source
   */
  private wasNotificationRecentlyShown(source: Source): boolean {
    const shownNotifications = getShownNotifications();
    return shownNotifications.some(
      (notification) => notification.source === source
    );
  }

  /**
   * Initialize the sidebar state. Should be called in onMount.
   * Loads initial data and sets up any necessary listeners.
   */
  initialize = async (
    preferredImageFormat?: ImageFormat | null
  ): Promise<() => void> => {
    if (this.#initialized) {
      return () => {};
    }

    // Set the preferred image format from server if provided
    if (preferredImageFormat !== undefined) {
      this.preferredImageFormat = preferredImageFormat;
    }

    // Only load data if we have a preferred format, otherwise wait for updateContext
    if (this.preferredImageFormat) {
      await this.loadData();
    }

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
  initializeNonBlocking = (
    preferredImageFormat?: ImageFormat | null
  ): (() => void) => {
    if (this.#initialized) {
      return () => {};
    }

    // Set the preferred image format from server if provided
    if (preferredImageFormat !== undefined) {
      this.preferredImageFormat = preferredImageFormat;
    }

    // Mark as initialized immediately for UI purposes
    this.#initialized = true;
    this.loading = false; // Allow UI to render

    // Load data in background only if we have a preferred format
    if (browser && this.preferredImageFormat) {
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
      const response = await fetch('/api/sidebar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredImageFormat: this.preferredImageFormat,
        }),
      });

      if (response.ok) {
        this.data = await response.json();
        this.updateStreamingSources(this.data?.streamingSources);
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
      const response = await fetch('/api/sidebar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredImageFormat: this.preferredImageFormat,
        }),
      });
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

  // Debounce data refresh to prevent excessive API calls
  private refreshDataDebounced = debounce(async () => {
    await this.loadData();
  }, 1000); // 1 second debounce

  async refreshData(): Promise<void> {
    // Use debounced version to prevent excessive calls
    return this.refreshDataDebounced();
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
    // Cancel any pending debounced refresh calls
    if (this.refreshDataDebounced?.clear) {
      this.refreshDataDebounced.clear();
    }

    // Reset all state
    this.data = null;
    this.loading = false;
    this.error = null;
    this.orderedSources = [];
    this.streamingSources = [];
    this.#initialized = false;
    this.#hasLoadedOnce = false;
    this.#isInitialStreamLoad = true;
    this.isDraggingDivider = false;
    this.preferredImageFormat = null;
    // Note: Don't reset isSidebarCollapsed or collapsed - they should persist across page refreshes
  }

  // Streaming sources management
  updateStreamingSources(newStreamingSources?: Source[]): void {
    if (!newStreamingSources) {
      return;
    }

    const previousStreams = new SvelteSet(this.streamingSources);
    const currentStreams = new SvelteSet(newStreamingSources);

    // Find sources that just started streaming
    const startedStreaming = newStreamingSources.filter(
      (source) => !previousStreams.has(source)
    );

    // Find sources that stopped streaming
    const stoppedStreaming = this.streamingSources.filter(
      (source) => !currentStreams.has(source)
    );

    // Update the sidebar streaming state
    this.streamingSources = newStreamingSources;

    // Check if this is the initial load and handle flag
    const isInitialLoad = this.#isInitialStreamLoad;
    if (isInitialLoad) {
      this.#isInitialStreamLoad = false;
    }

    // Only send notifications for real-time changes, not on initial load
    if (!isInitialLoad) {
      // Send notifications for streams that started
      startedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;

        // Only show notification if it wasn't recently shown
        if (!this.wasNotificationRecentlyShown(source)) {
          showToast(`${displayName} is now streaming.`);
          this.recordShownNotification(source);
        }
      });

      // Send notifications for streams that stopped
      stoppedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;
        showToast(`${displayName} has stopped streaming.`);
      });
    }
  }

  isSourceStreaming(source: Source): boolean {
    return this.streamingSources.includes(source);
  }

  getStreamingSources(): Source[] {
    return [...this.streamingSources];
  }

  // Test helper methods (only for testing)
  /**
   * Set the initial stream load flag (for testing)
   */
  setInitialStreamLoadFlag(value: boolean): void {
    this.#isInitialStreamLoad = value;
  }

  /**
   * Get the initial stream load flag (for testing)
   */
  getInitialStreamLoadFlag(): boolean {
    return this.#isInitialStreamLoad;
  }
}

const DEFAULT_KEY = '$_sidebar_state';

/**
 * Set sidebar state in context
 */
export function setSidebarState(key = DEFAULT_KEY): SidebarStateClass {
  const sidebarState = new SidebarStateClass();
  return setContext(key, sidebarState);
}

/**
 * Get sidebar state from context
 */
export function getSidebarState(key = DEFAULT_KEY): SidebarState {
  return getContext<SidebarState>(key);
}
