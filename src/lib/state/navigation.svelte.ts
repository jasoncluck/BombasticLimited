import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
import { invalidateAll } from '$app/navigation';
import { showToast } from '$lib/state/notifications.svelte.js';
import debounce from 'debounce';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { UserProfile } from '$lib/supabase/user-profiles';
import { preloadData } from '$app/navigation';
import { browser } from '$app/environment';
import type { NotificationWithMeta } from '$lib/supabase/notifications';
import { page } from '$app/state';

/**
 * Navigation item interface defining structure for navigation elements
 */
export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon?: unknown;
  testId?: string;
  isActive?: (pathname: string) => boolean;
  onClick?: (event: Event, href: string) => void | Promise<void>;
}

/**
 * Navigation state configuration
 */
export interface NavigationConfig {
  enableHomeNavigation: boolean;
  enableBrandLogo: boolean;
  homeRouteReplaceState: boolean;
  searchDebounceMs: number;
  preloadDebounceMs: number;
  notificationRefreshIntervalMs: number;
}

/**
 * Navigation data interface
 */
export interface NavigationData {
  userProfile: UserProfile | null;
  navigationItems: NavigationItem[];
  userNotifications: NotificationWithMeta[];
}

/**
 * Navigation state interface
 */
export interface NavigationState {
  // Core data state
  data: NavigationData;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Navigation state
  activeRoute: string;
  isNavigating: boolean;
  navigationItems: NavigationItem[];

  // Search state
  searchQuery: string;
  isSearching: boolean;
  currentDebouncedSearch: ReturnType<typeof debounce> | null;
  searchAbortController: AbortController | null;

  // User context
  session: Session | null;
  userProfile: UserProfile | null;
  supabase: SupabaseClient<Database> | null;

  // Account drawer state
  openAccountDrawer: boolean;

  // Configuration
  config: NavigationConfig;

  // Navigation methods
  handleLogout: () => Promise<void>;
  searchRedirect: (
    e: Event,
    expectedValue?: string,
    searchTimestamp?: number
  ) => Promise<Event>;
  handleSearch: (e: Event) => void;
  handleHomeNavigation: (event: Event, href?: string) => Promise<void>;
  handleNavigation: (event: Event, item: NavigationItem) => Promise<void>;

  // Search methods
  setSearchQuery: (value: string) => void;
  clearSearchQuery: () => void;
  syncSearchQueryFromUrl: (pathname: string, force?: boolean) => void;

  // Account drawer methods
  toggleAccountDrawer: () => void;
  setAccountDrawer: (open: boolean) => void;

  // Navigation item management
  addNavigationItem: (item: NavigationItem) => void;
  removeNavigationItem: (id: string) => void;
  getNavigationItem: (id: string) => NavigationItem | null;
  isNavigationItemActive: (item: NavigationItem) => boolean;

  // Data methods
  loadData: () => Promise<void>;
  loadDataInBackground: () => Promise<void>;
  refreshData: () => Promise<void>;
  initialize: () => Promise<() => void>;
  initializeNonBlocking: () => () => void;
  initializeEffects: () => void;

  // Context methods
  updateContext: (updates: {
    session?: Session | null;
    userProfile?: UserProfile | null;
    supabase?: SupabaseClient<Database>;
  }) => void;
  updateActiveRoute: (pathname: string) => void;
  updateConfig: (updates: Partial<NavigationConfig>) => void;

  // Utility methods
  getNavigationButtonClasses: (
    item: NavigationItem,
    additionalClasses?: string
  ) => string;

  // Validation helpers
  isDataLoaded: boolean;
  hasError: boolean;
  showPlaceholder: boolean;

  // Cleanup method
  cleanup: () => void;
}

/**
 * Navigation state class implementing the NavigationState interface
 * Centralizes navigation logic, state management, and user interactions
 */
export class NavigationStateClass implements NavigationState {
  // Private tracking variables
  private refreshInterval: number | null = null;
  private lastRefreshTime: number = 0;
  private preloadTimeout: number | null = null;
  private currentSearchTimestamp: number = 0;
  private pendingValueUpdate: string | null = null;
  private lastNavigationTimestamp: number = 0;
  private lastUserInputTimestamp: number = 0;

  // Core data state
  data = $state<NavigationData>({
    userProfile: null,
    navigationItems: [],
    userNotifications: [],
  });

  loading = $state(true);
  error = $state<string | null>(null);
  #initialized = $state(false);
  #hasLoadedOnce = $state(false);

  // Core navigation state
  activeRoute = $state<string>('');
  isNavigating = $state(false);

  // Navigation items configuration
  navigationItems = $state<NavigationItem[]>([]);

  // Notifications
  userNotifications = $state<NotificationWithMeta[]>([]);

  // Search state
  searchQuery = $state('');
  isSearching = $state(false);
  searchAbortController = $state<AbortController | null>(null);
  currentDebouncedSearch = $state<ReturnType<typeof debounce> | null>(null);

  // Configuration
  config = $state<NavigationConfig>({
    enableHomeNavigation: true,
    enableBrandLogo: true,
    homeRouteReplaceState: true,
    searchDebounceMs: 400,
    preloadDebounceMs: 125,
    notificationRefreshIntervalMs: 5 * 60 * 1000, // 5 minutes
  });

  // User context - now properly reactive
  session = $state<Session | null>(null);
  userProfile = $state<UserProfile | null>(null);
  supabase = $state<SupabaseClient<Database> | null>(null);

  // Account drawer state (shared with user menu)
  openAccountDrawer = $state(false);

  constructor() {
    this.initializeNavigationItems();
  }

  /**
   * Initialize default navigation items
   */
  private initializeNavigationItems(): void {
    this.navigationItems = [
      {
        id: 'home',
        label: 'Home',
        href: '/',
        testId: 'home-link',
        isActive: (pathname) => pathname === '/',
        onClick: this.handleHomeNavigation.bind(this),
      },
      {
        id: 'brand-logo',
        label: 'Bombastic Home',
        href: '/',
        testId: 'brand-logo-link',
        isActive: (pathname) => pathname === '/',
        onClick: this.handleHomeNavigation.bind(this),
      },
    ];
  }

  /**
   * Start the notification refresh interval
   */
  private startRefreshInterval(): void {
    if (!browser || this.refreshInterval) return;

    this.refreshInterval = window.setInterval(() => {
      // Only refresh if we have a session and enough time has passed
      if (this.session && this.#hasLoadedOnce) {
        const now = Date.now();
        const timeSinceLastRefresh = now - this.lastRefreshTime;

        // Ensure at least 4.5 minutes have passed since last refresh to avoid rapid refreshes
        if (timeSinceLastRefresh >= 4.5 * 60 * 1000) {
          this.loadDataInBackground();
          this.lastRefreshTime = now;
        }
      }
    }, this.config.notificationRefreshIntervalMs);
  }

  /**
   * Stop the notification refresh interval
   */
  private stopRefreshInterval(): void {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Extract search query from URL and update state
   */
  private extractSearchFromUrl(pathname: string): string {
    const searchMatch = pathname.match(/^\/search\/(.+?)(?:\/.*)?$/);
    if (searchMatch && searchMatch[1]) {
      try {
        return decodeURIComponent(searchMatch[1]);
      } catch (error) {
        console.error('Error decoding search query from URL:', error);
        return '';
      }
    }
    return '';
  }

  /**
   * Sync search query from URL - now exposed as public method with better timing controls
   */
  syncSearchQueryFromUrl = (pathname: string, force: boolean = false): void => {
    const urlSearchQuery = this.extractSearchFromUrl(pathname);
    this.searchQuery = urlSearchQuery;
  };

  // Initialize effects (should be called when component is mounted)
  initializeEffects() {
    if (browser) {
      // Initialize navigation items from data when loaded
      $effect(() => {
        if (this.data?.navigationItems) {
          this.navigationItems = [...this.data.navigationItems];
        }
      });

      // Start/stop refresh interval based on session state
      $effect(() => {
        if (this.session && this.#hasLoadedOnce) {
          this.startRefreshInterval();
        } else {
          this.stopRefreshInterval();
        }
      });
    }
  }

  get initialized() {
    return this.#initialized;
  }

  /**
   * Initialize the navigation state. Should be called in onMount.
   * Loads initial data and sets up any necessary listeners.
   */
  initialize = async (): Promise<() => void> => {
    if (this.#initialized) {
      return () => {};
    }

    // Load initial data
    await this.loadData();
    this.#initialized = true;

    // Start refresh interval if we have a session
    if (this.session) {
      this.startRefreshInterval();
    }

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

  /**
   * Update user context (called by parent components)
   */
  updateContext(updates: {
    session?: Session | null;
    userProfile?: UserProfile | null;
    supabase?: SupabaseClient<Database>;
  }): void {
    if (updates.session !== undefined) {
      this.session = updates.session;
    }
    if (updates.userProfile !== undefined) {
      this.userProfile = updates.userProfile;
    }
    if (updates.supabase !== undefined) {
      this.supabase = updates.supabase;
    }
  }

  /**
   * Update the active route (should be called when route changes)
   */
  updateActiveRoute(pathname: string): void {
    this.activeRoute = pathname;
  }

  /**
   * Get navigation item by ID
   */
  getNavigationItem(id: string): NavigationItem | null {
    return this.navigationItems.find((item) => item.id === id) || null;
  }

  /**
   * Check if a navigation item is active
   */
  isNavigationItemActive(item: NavigationItem): boolean {
    if (item.isActive) {
      return item.isActive(this.activeRoute);
    }
    return this.activeRoute === item.href;
  }

  /**
   * Handle home navigation with search query clearing
   */
  async handleHomeNavigation(event: Event, href: string = '/'): Promise<void> {
    if (!browser) return;

    event.preventDefault();
    this.isNavigating = true;

    try {
      // Clear search query when navigating home
      this.clearSearchQuery();

      await goto(href, {
        replaceState: this.config.homeRouteReplaceState,
      });
    } catch (error) {
      console.error('Navigation error:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Generic navigation handler for other routes
   */
  async handleNavigation(event: Event, item: NavigationItem): Promise<void> {
    if (!browser) return;

    event.preventDefault();
    this.isNavigating = true;

    try {
      if (item.onClick) {
        await item.onClick(event, item.href);
      } else {
        await goto(item.href);
      }
    } catch (error) {
      console.error('Navigation error:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Handle logout functionality
   */
  async handleLogout(): Promise<void> {
    if (!this.supabase) {
      console.error('Supabase client not available for logout');
      return;
    }

    try {
      // Stop refresh interval on logout
      this.stopRefreshInterval();

      const { error } = await this.supabase.auth.signOut();

      if (error) {
        console.error('Error signing out:', error);
        showToast('Error logging out', 'error');
        return;
      }

      showToast('Logged out successfully', 'success');

      // Invalidate all data and let SvelteKit handle the state updates
      this.refreshData();
      await invalidateAll();

      // Navigate to home page
      await goto('/', { replaceState: true });
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Error during logout', 'error');
      // Fallback to page reload if invalidation fails
      if (browser && window) {
        window.location.href = '/';
      }
    }
  }

  /**
   * Search methods
   */
  setSearchQuery = (value: string): void => {
    this.searchQuery = value;
  };

  // Clear all search-related state
  clearSearchQuery = (): void => {
    this.searchQuery = '';
    this.currentSearchTimestamp = 0;
    this.pendingValueUpdate = null;
    this.lastUserInputTimestamp = 0;

    // Cancel any pending searches
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // Clear any preload timeout
    if (this.preloadTimeout) {
      window.clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }
  };

  async searchRedirect(
    e: Event,
    expectedValue?: string,
    searchTimestamp?: number
  ): Promise<Event> {
    const input = e.target as HTMLInputElement;
    const searchValue = input.value.trim();
    const navigationTimestamp = Date.now();
    this.lastNavigationTimestamp = navigationTimestamp;

    // If an expected value was passed and current value doesn't match, abort
    if (expectedValue !== undefined && searchValue !== expectedValue) {
      return e;
    }

    // If this search is from an older timestamp, abort
    if (
      searchTimestamp !== undefined &&
      searchTimestamp < this.currentSearchTimestamp
    ) {
      return e;
    }

    // Verify that the current input value still matches what we expect
    // This prevents stale navigations when user has typed new content
    if (this.searchQuery.trim() !== searchValue) {
      return e;
    }

    // Cancel any pending search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    this.isSearching = true;

    try {
      if (searchValue === '') {
        // Before navigating to home, check if user has started typing something new
        // Add a small delay to check if the search state has changed
        await new Promise((resolve) => setTimeout(resolve, 10));

        // If navigation timestamp is outdated or user has started typing, abort
        if (
          navigationTimestamp < this.lastNavigationTimestamp ||
          this.searchQuery.trim() !== ''
        ) {
          return e;
        }

        // Only navigate to "/" if we're still in the empty state
        await goto(`/`, { keepFocus: true, replaceState: false });
      } else if (searchValue.length >= 2) {
        // Check again before navigation for non-empty searches
        if (
          navigationTimestamp < this.lastNavigationTimestamp ||
          this.searchQuery.trim() !== searchValue
        ) {
          return e;
        }

        // Only navigate to search if 2+ characters
        // Create new abort controller for this search
        this.searchAbortController = new AbortController();

        // Use replaceState: true to avoid creating new history entries for search
        await goto(`/search/${encodeURIComponent(searchValue)}`, {
          keepFocus: true,
          replaceState: true,
        });
      }
      // For single characters (length === 1), do nothing - stay on current page
    } catch (error) {
      // Don't log abort errors - they're expected
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Search navigation error:', error);
      }
    } finally {
      // Only clear isSearching if this is still the most recent navigation
      if (navigationTimestamp >= this.lastNavigationTimestamp) {
        this.isSearching = false;
        this.searchAbortController = null;
      }
    }

    return e;
  }

  handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;
    const searchValue = input.value.trim();
    const searchTimestamp = Date.now();

    // Update the searchQuery state to match the input
    this.searchQuery = input.value;
    this.currentSearchTimestamp = searchTimestamp;
    this.lastUserInputTimestamp = searchTimestamp; // Track when user last typed

    // Cancel current debounced search if it exists
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }

    // Cancel any ongoing search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // Clear any existing preload timeout
    if (this.preloadTimeout) {
      window.clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }

    // Capture the search value and timestamp at the time of creating the debounced function
    const capturedSearchValue = searchValue;
    const capturedTimestamp = searchTimestamp;

    // Set up preloading at half the debounce time if search value is valid for navigation
    if (capturedSearchValue.length >= 2) {
      this.preloadTimeout = window.setTimeout(() => {
        // Only preload if the search value hasn't changed and timestamp is still current
        if (
          this.searchQuery.trim() === capturedSearchValue &&
          this.currentSearchTimestamp === capturedTimestamp
        ) {
          const searchUrl = `/search/${encodeURIComponent(capturedSearchValue)}`;
          preloadData(searchUrl);
        }
      }, this.config.preloadDebounceMs);
    }

    // Always use debounced search for all cases (including empty)
    this.currentDebouncedSearch = debounce(() => {
      if (
        this.searchQuery.trim() === capturedSearchValue &&
        this.currentSearchTimestamp === capturedTimestamp
      ) {
        this.searchRedirect(e, capturedSearchValue, capturedTimestamp);
      }
    }, this.config.searchDebounceMs);

    this.currentDebouncedSearch();
  }

  /**
   * Toggle account drawer state
   */
  toggleAccountDrawer(): void {
    this.openAccountDrawer = !this.openAccountDrawer;
  }

  /**
   * Set account drawer state
   */
  setAccountDrawer(open: boolean): void {
    this.openAccountDrawer = open;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<NavigationConfig>): void {
    const oldInterval = this.config.notificationRefreshIntervalMs;
    this.config = { ...this.config, ...updates };

    // If refresh interval changed, restart the interval
    if (
      updates.notificationRefreshIntervalMs &&
      updates.notificationRefreshIntervalMs !== oldInterval &&
      this.refreshInterval
    ) {
      this.stopRefreshInterval();
      this.startRefreshInterval();
    }
  }

  /**
   * Add custom navigation item
   */
  addNavigationItem(item: NavigationItem): void {
    const existingIndex = this.navigationItems.findIndex(
      (existing) => existing.id === item.id
    );

    if (existingIndex >= 0) {
      this.navigationItems[existingIndex] = item;
    } else {
      this.navigationItems.push(item);
    }
  }

  /**
   * Remove navigation item
   */
  removeNavigationItem(id: string): void {
    this.navigationItems = this.navigationItems.filter(
      (item) => item.id !== id
    );
  }

  // Data loading methods
  async loadData(): Promise<void> {
    if (!browser) return;

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch('/api/navigation');
      if (response.ok) {
        const navigationData = await response.json();

        this.data = {
          userProfile: navigationData.userProfile ?? null,
          navigationItems: navigationData.navigationItems ?? [],
          userNotifications: navigationData.notifications ?? [],
        };
        this.#hasLoadedOnce = true;
        this.lastRefreshTime = Date.now();
      } else {
        this.error = `Failed to load navigation data: ${response.statusText}`;
        console.error(this.error);
      }
    } catch (error) {
      this.error = 'Failed to load navigation';
      console.error('Failed to load navigation:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadDataInBackground(): Promise<void> {
    if (!browser) return;

    // Don't show loading state for background loads
    this.error = null;

    try {
      const response = await fetch('/api/navigation');
      if (response.ok) {
        const navigationData = await response.json();

        this.data = {
          userProfile: navigationData.userProfile || null,
          navigationItems:
            navigationData.navigationItems || this.navigationItems,
          userNotifications: navigationData.notifications ?? [],
        };
        this.#hasLoadedOnce = true;
        this.lastRefreshTime = Date.now();
      } else {
        this.error = `Failed to load navigation data: ${response.statusText}`;
        console.error(this.error);
      }
    } catch (error) {
      this.error = 'Failed to load navigation';
      console.error('Failed to load navigation:', error);
    }
  }

  async refreshData(): Promise<void> {
    await this.loadData();
  }

  // Data validation helpers
  get isDataLoaded(): boolean {
    return this.data !== null && !this.loading;
  }

  get hasError(): boolean {
    return this.error !== null;
  }

  get showPlaceholder(): boolean {
    // Only show placeholder on initial load (initialized but never loaded data successfully)
    return this.#initialized && !this.#hasLoadedOnce && !this.hasError;
  }

  /**
   * Get button classes for navigation elements
   */
  getNavigationButtonClasses(
    item: NavigationItem,
    additionalClasses: string = ''
  ): string {
    const baseClasses = 'transition-opacity duration-200 hover:opacity-80';
    const activeClasses = this.isNavigationItemActive(item)
      ? 'opacity-100'
      : '';

    return `${baseClasses} ${activeClasses} ${additionalClasses}`.trim();
  }

  /**
   * Cleanup method
   */
  cleanup(): void {
    // Stop refresh interval
    this.stopRefreshInterval();

    // Cancel any pending search operations
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // Clear preload timeout
    if (this.preloadTimeout) {
      window.clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }

    // Reset all state
    this.data = {
      userProfile: null,
      navigationItems: [],
      userNotifications: [],
    };
    this.loading = false;
    this.error = null;
    this.#initialized = false;
    this.#hasLoadedOnce = false;
    this.isNavigating = false;
    this.isSearching = false;
    this.searchQuery = '';
    this.openAccountDrawer = false;
    this.lastRefreshTime = 0;
    this.currentSearchTimestamp = 0;
    this.pendingValueUpdate = null;
    this.lastNavigationTimestamp = 0;
    this.lastUserInputTimestamp = 0;
  }
}

const DEFAULT_KEY = '$_navigation_state';

/**
 * Set navigation state in context
 */
export function setNavigationState(key = DEFAULT_KEY): NavigationStateClass {
  const navigationState = new NavigationStateClass();
  return setContext(key, navigationState);
}

/**
 * Get navigation state from context
 */
export function getNavigationState(key = DEFAULT_KEY): NavigationState {
  return getContext<NavigationState>(key);
}
