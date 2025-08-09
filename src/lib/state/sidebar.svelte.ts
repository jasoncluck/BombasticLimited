import type { Playlist } from '$lib/supabase/playlists';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { Session } from '@supabase/supabase-js';
import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { SOURCE_INFO } from '$lib/constants/source';
import { tabVisibility } from '$lib/utils/tab-visibility.js';
import { showNotification } from '$lib/stores/notification.js';
import { source, type Source as SSESource } from 'sveltekit-sse';
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
} from '$lib/components/ui/sidebar/constants';

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

export class SidebarStateClass {
  data = $state<SidebarData | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);
  #initialized = $state(false);
  #hasLoadedOnce = $state(false); // Track if we've loaded data at least once

  // Sidebar state properties
  collapsed = $state(false);
  openAccountDrawer = $state(false);

  // Derived values for easier access
  playlists = $derived(this.data?.playlists ?? []);
  userProfile = $derived(this.data?.userProfile ?? null);
  userPlaylistsCount = $derived(this.data?.userPlaylistsCount ?? 0);

  // Drag and drop state
  draggedSourceIndex = $state<number | null>(null);
  targetSourceIndex = $state<number | null>(null);

  // Source ordering state
  orderedSources = $state<Source[]>([]);

  // Streaming sources state
  streamingSources = $state<Source[]>([]);

  // SSE connection state
  #sseConnection = $state<SSESource | null>(null);
  #sseConnected = $state(false);
  #isInitialStreamLoad = $state(true);

  constructor() {
    // Initialize sidebar state from cookie on construction
    this.loadStateFromCookie();
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

  get sseConnected() {
    return this.#sseConnected;
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
  initialize = async (): Promise<() => void> => {
    if (this.#initialized) {
      return () => {};
    }

    // Load initial data
    await this.loadData();
    this.#initialized = true;

    // Start SSE connection
    this.startSSEConnection();

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

    // Start SSE connection
    this.startSSEConnection();

    // Return cleanup function
    return () => {
      this.cleanup();
    };
  };

  /**
   * Start SSE connection for streaming updates using sveltekit-sse
   */
  startSSEConnection(): void {
    if (!browser || this.#sseConnection) {
      return; // Already connected or not in browser
    }

    // Reset initial load flag when starting
    this.#isInitialStreamLoad = true;

    try {
      console.log('Starting SSE connection to /api/twitch...');
      this.#sseConnection = source('/api/twitch');

      this.#sseConnection.select('streamingSubscriptions').subscribe((data) => {
        try {
          const streamingSources: Source[] = JSON.parse(data);
          this.updateStreamingState(streamingSources);
        } catch (error) {
          console.error('Failed to parse streaming update:', error);
        }
      });

      this.#sseConnection.select('open').subscribe(() => {
        this.#sseConnected = true;
        console.log('Twitch streaming SSE connection established');
      });

      this.#sseConnection.select('error').subscribe((event) => {
        this.#sseConnected = false;
        console.error('Twitch streaming SSE error:', event);
      });
    } catch (error) {
      console.error('Failed to create SSE connection:', error);
    }
  }

  /**
   * Stop SSE connection
   */
  stopSSEConnection(): void {
    if (this.#sseConnection) {
      this.#sseConnection.close();
      this.#sseConnection = null;
      this.#sseConnected = false;
      console.log('Twitch streaming SSE connection closed');
    }
  }

  /**
   * Update the local streaming state and send notifications
   */
  private updateStreamingState(newStreamingSources: Source[]): void {
    const previousStreams = new Set(this.streamingSources);
    const currentStreams = new Set(newStreamingSources);

    // Find sources that just started streaming
    const startedStreaming = newStreamingSources.filter(
      (source) => !previousStreams.has(source)
    );

    // Find sources that stopped streaming
    const stoppedStreaming = this.streamingSources.filter(
      (source) => !currentStreams.has(source)
    );

    // Update the sidebar streaming state
    this.updateStreamingSources(newStreamingSources);

    // Only send notifications for real-time changes, not on initial load
    if (!this.#isInitialStreamLoad) {
      // Send notifications for streams that started
      startedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;

        // Only show notification if it wasn't recently shown
        if (!this.wasNotificationRecentlyShown(source)) {
          showNotification(`${displayName} is now streaming.`);
          this.recordShownNotification(source);
        }
      });

      // Send notifications for streams that stopped
      stoppedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;
        showNotification(`${displayName} has stopped streaming.`);
      });
    }

    // Mark initial load as complete after first update
    if (this.#isInitialStreamLoad) {
      this.#isInitialStreamLoad = false;
    }
  }

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
    // Stop SSE connection
    this.stopSSEConnection();

    // Reset all state
    this.data = null;
    this.loading = false;
    this.error = null;
    this.orderedSources = [];
    this.streamingSources = [];
    this.#initialized = false;
    this.#hasLoadedOnce = false;
    this.#isInitialStreamLoad = true;
  }

  // Streaming sources management
  updateStreamingSources(sources: Source[]): void {
    this.streamingSources = [...sources];
  }

  isSourceStreaming(source: Source): boolean {
    return this.streamingSources.includes(source);
  }

  getStreamingSources(): Source[] {
    return [...this.streamingSources];
  }

  // Convenience methods for backward compatibility
  setSidebarState(state: any): void {
    // This method exists for compatibility but doesn't need to do anything
    // since the sidebar state is already "this"
    console.log('setSidebarState called - sidebar state is already set');
  }

  start(): void {
    // Alias for startSSEConnection for backward compatibility
    this.startSSEConnection();
  }

  stop(): void {
    // Alias for stopSSEConnection for backward compatibility
    this.stopSSEConnection();
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
