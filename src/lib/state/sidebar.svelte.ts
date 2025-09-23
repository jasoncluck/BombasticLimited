import type { Playlist } from '$lib/supabase/playlists';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { Session } from '@supabase/supabase-js';
import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { SOURCE_INFO } from '$lib/constants/source';
import { tabVisibility } from '$lib/utils/tab-visibility';
import { showToast } from '$lib/state/notifications.svelte';
// Removed SSE import - now using polling
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

  // Drag and drop state
  draggedSourceIndex: number | null;
  targetSourceIndex: number | null;

  // Source ordering state
  orderedSources: Source[];

  // Streaming sources state
  streamingSources: Source[];

  // Polling connection state
  pollingActive: boolean;

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
  initialize: () => Promise<() => void>;
  initializeNonBlocking: () => () => void;
  initializeEffects: () => void;

  // Polling methods
  startSSEConnection: () => void;
  stopSSEConnection: () => void;
  start: () => void;
  stop: () => void;

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

  // Preferred image format - now properly reactive
  preferredImageFormat = $state<ImageFormat | null>(null);

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

  // Polling connection state  
  #pollingInterval: number | null = null;
  #pollingActive = $state(false);
  #isInitialStreamLoad = $state(true);
  #tabVisibilityUnsubscribe: (() => void) | null = null;
  
  // Polling configuration  
  #pollingIntervalMs = 3 * 60 * 1000; // 3 minutes as requested

  // Configuration (from layout pattern)
  config = $state<SidebarConfig>({
    searchDebounceMs: 250,
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
    if (updates.preferredImageFormat !== undefined) {
      this.preferredImageFormat = updates.preferredImageFormat;
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

  get pollingActive() {
    return this.#pollingActive;
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
   * Start polling for streaming updates every 3 minutes
   * Respects tab visibility - pauses when tab is hidden, resumes when visible
   */
  startSSEConnection(): void {
    if (!browser || this.#pollingInterval) {
      return;
    }

    this.#isInitialStreamLoad = true;
    this.#pollingActive = true;
    
    console.log('🔄 Starting Twitch stream polling (3 minute intervals, tab-visibility aware)...');
    
    // Subscribe to tab visibility changes
    this.#tabVisibilityUnsubscribe = tabVisibility.subscribe((state) => {
      if (state.isVisible && this.#pollingActive) {
        // Tab became visible - resume polling if not already running
        if (!this.#pollingInterval) {
          this.resumePolling();
        }
      } else if (state.isHidden) {
        // Tab became hidden - pause polling
        this.pausePolling();
      }
    });
    
    // Start polling immediately if tab is visible
    if (tabVisibility.isVisible) {
      this.resumePolling();
    }
  }

  /**
   * Resume polling (internal method)
   */
  private resumePolling(): void {
    if (this.#pollingInterval) {
      return; // Already running
    }

    console.log('▶️ Resuming Twitch stream polling (tab visible)');
    
    // Do initial poll immediately when resuming
    this.pollStreamingStatus();
    
    // Set up polling interval
    this.#pollingInterval = window.setInterval(() => {
      this.pollStreamingStatus();
    }, this.#pollingIntervalMs);
  }

  /**
   * Pause polling (internal method)
   */
  private pausePolling(): void {
    if (!this.#pollingInterval) {
      return; // Already paused
    }

    console.log('⏸️ Pausing Twitch stream polling (tab hidden)');
    
    clearInterval(this.#pollingInterval);
    this.#pollingInterval = null;
  }

  /**
   * Manually retry polling connection (restarts polling)
   */
  retrySSEConnection(): void {
    if (!browser) {
      return;
    }

    // Stop existing polling
    this.stopSSEConnection();

    console.log('🔄 Manually restarting Twitch stream polling...');
    this.startSSEConnection();
  }

  /**
   * Poll the server for current streaming status
   */
  private async pollStreamingStatus(): Promise<void> {
    try {
      const response = await fetch('/api/twitch', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const streamingSources: Source[] = await response.json();
      this.updateStreamingState(streamingSources);
      
      if (this.#isInitialStreamLoad) {
        console.log('📡 Initial streaming status loaded:', streamingSources);
        this.#isInitialStreamLoad = false;
      }
    } catch (error) {
      console.error('Failed to poll streaming status:', error);
      // Continue polling even on error - don't stop the interval
    }
  }

  /**
   * Stop polling for streaming updates
   */
  stopSSEConnection(): void {
    console.log('🛑 Stopping Twitch stream polling...');
    
    if (this.#pollingInterval) {
      clearInterval(this.#pollingInterval);
      this.#pollingInterval = null;
    }
    
    // Clean up tab visibility subscription
    if (this.#tabVisibilityUnsubscribe) {
      this.#tabVisibilityUnsubscribe();
      this.#tabVisibilityUnsubscribe = null;
    }
    
    this.#pollingActive = false;
  }

  /**
   * Update the local streaming state and send notifications
   */
  private updateStreamingState(newStreamingSources: Source[]): void {
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
    this.updateStreamingSources(newStreamingSources);

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
    // Only refresh if tab is visible to save resources
    // Also check if we're already refreshing to prevent duplicate calls
    if (!tabVisibility.isVisible || this.loading) {
      return;
    }

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
    // Stop SSE connection
    this.stopSSEConnection();

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
  updateStreamingSources(sources: Source[]): void {
    this.streamingSources = [...sources];
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

  start(): void {
    // Alias for startSSEConnection for backward compatibility
    this.startSSEConnection();
  }

  stop(): void {
    // Alias for stopSSEConnection for backward compatibility
    this.stopSSEConnection();
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
