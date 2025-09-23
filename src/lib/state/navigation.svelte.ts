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

  // Search state - separated into input value and URL value
  searchInputValue: string; // What the user is actually typing
  searchQuery: string; // What's in the URL/navigation state
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
  setSearchInputValue: (value: string) => void;
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
 * FIXED: Prevents search input value from being overwritten during active typing
 */
export class NavigationStateClass implements NavigationState {
  // Private tracking variables
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private lastRefreshTime: number = 0;
  private preloadTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentSearchTimestamp: number = 0;
  private lastNavigationTimestamp: number = 0;
  private lastUserInputTimestamp: number = 0;
  private isUserTyping: boolean = false;
  private typingTimeout: ReturnType<typeof setTimeout> | undefined;
  private wasInternalNavigation: boolean = false;

  // Performance and preloading improvements
  private preloadInProgress: boolean = false;
  private pendingPreloadValue: string = '';
  private lastSuccessfulPreload: string = '';

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

  // Search state - separated into input and URL state
  searchInputValue = $state(''); // What the user is typing in the input
  searchQuery = $state(''); // What's in the URL/navigation state
  isSearching = $state(false);
  searchAbortController = $state<AbortController | null>(null);
  currentDebouncedSearch = $state<ReturnType<typeof debounce> | null>(null);

  // Optimized configuration for better performance
  config = $state<NavigationConfig>({
    enableHomeNavigation: true,
    enableBrandLogo: true,
    homeRouteReplaceState: true,
    searchDebounceMs: 350, // Optimized from 400ms
    preloadDebounceMs: 100, // Optimized from 150ms
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
   * No longer used - refresh is now managed by the layout component
   * @deprecated Layout component now handles all refresh operations
   */
  private startRefreshInterval(): void {
    // Refresh interval is now managed by the layout component
    // This method is kept for backward compatibility but does nothing
    return;
  }

  /**
   * Stop the notification refresh interval
   * No longer used - refresh is now managed by the layout component
   * @deprecated Layout component now handles all refresh operations
   */
  private stopRefreshInterval(): void {
    // Refresh interval is now managed by the layout component
    // This method is kept for backward compatibility but does nothing
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
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
   * Improved preload management - more reliable
   */
  private async triggerPreload(searchValue: string): Promise<void> {
    if (this.preloadInProgress || searchValue.length < 2) {
      return;
    }

    // Skip if we recently preloaded this exact value successfully
    if (this.lastSuccessfulPreload === searchValue) {
      return;
    }

    this.preloadInProgress = true;
    this.pendingPreloadValue = searchValue;

    try {
      const searchUrl = `/search/${encodeURIComponent(searchValue)}`;
      await preloadData(searchUrl);

      // Only update if this preload is still current
      if (this.pendingPreloadValue === searchValue) {
        this.lastSuccessfulPreload = searchValue;
      }
    } catch (error) {
      console.warn('Preload failed:', error);
    } finally {
      this.preloadInProgress = false;
    }
  }

  /**
   * FIXED: Sync search query from URL - Enhanced to NEVER overwrite user input during active typing
   */
  syncSearchQueryFromUrl = (pathname: string, force: boolean = false): void => {
    const urlSearchQuery = this.extractSearchFromUrl(pathname);

    // Always update the URL-based search query (this doesn't affect the input)
    this.searchQuery = urlSearchQuery;

    const now = Date.now();
    const timeSinceLastInput = now - this.lastUserInputTimestamp;

    // CRITICAL FIX: Be much more conservative about overwriting input
    // Only sync to input value if ALL of these conditions are met:
    const shouldSyncToInput =
      // Force is explicitly requested AND it's not from our internal navigation
      (force && !this.wasInternalNavigation) ||
      // OR all of these safety conditions are met:
      (!this.isUserTyping && // User is not actively typing
        !this.isSearching && // Not currently processing a search
        timeSinceLastInput > 5000 && // Much longer grace period (5s instead of 3s)
        this.searchInputValue.trim() === '' && // Input is empty (user hasn't typed anything)
        !this.preloadInProgress); // Not in middle of preloading

    if (shouldSyncToInput) {
      this.searchInputValue = urlSearchQuery;
    }

    // Reset the internal navigation flag after processing
    this.wasInternalNavigation = false;
  };

  // Initialize effects (should be called when component is mounted)
  initializeEffects() {
    if (browser) {
      // Navigation items initialization from data
      $effect(() => {
        if (this.data?.navigationItems) {
          this.navigationItems = [...this.data.navigationItems];
        }
      });

      // Refresh interval is now managed by the layout component
      // No need for session-based refresh interval management here
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

    // Refresh interval is now managed by the layout component
    // No need to start our own refresh interval here

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
    }
  }

  /**
   * FIXED: Search methods with better user input protection
   */
  setSearchInputValue = (value: string): void => {
    this.searchInputValue = value;
    this.lastUserInputTimestamp = Date.now();
    this.isUserTyping = true;

    // Clear the typing flag after a shorter delay for better responsiveness
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.isUserTyping = false;
    }, 200); // Reduced from 500ms
  };

  setSearchQuery = (value: string): void => {
    this.searchQuery = value;
  };

  // FIXED: Clear all search-related state with better cleanup
  clearSearchQuery = (): void => {
    this.searchInputValue = '';
    this.searchQuery = '';
    this.currentSearchTimestamp = 0;
    this.lastUserInputTimestamp = 0;
    this.isUserTyping = false;
    this.lastSuccessfulPreload = '';
    this.pendingPreloadValue = '';
    this.preloadInProgress = false;

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
      clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }

    // Clear typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = undefined;
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
    if (this.searchInputValue.trim() !== searchValue) {
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
          this.searchInputValue.trim() !== ''
        ) {
          return e;
        }

        // Mark as internal navigation before goto
        this.wasInternalNavigation = true;

        // Only navigate to "/" if we're still in the empty state
        await goto(`/`, { keepFocus: true, replaceState: false });
      } else if (searchValue.length >= 2) {
        // Check again before navigation for non-empty searches
        if (
          navigationTimestamp < this.lastNavigationTimestamp ||
          this.searchInputValue.trim() !== searchValue
        ) {
          return e;
        }

        // Only navigate to search if 2+ characters
        // Create new abort controller for this search
        this.searchAbortController = new AbortController();

        // Mark as internal navigation before goto
        this.wasInternalNavigation = true;

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

      // CRITICAL: Always reset the internal navigation flag here
      // This was missing in some code paths causing the bug
      this.wasInternalNavigation = false;
    }

    return e;
  }

  /**
   * FIXED: Improved search handler with better preloading and no input overwrites
   */
  handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;
    const searchValue = input.value.trim();
    const searchTimestamp = Date.now();

    // Update the input value state to match the input AND mark as user typing
    this.setSearchInputValue(input.value);
    this.currentSearchTimestamp = searchTimestamp;

    // Cancel current debounced search if it exists
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }

    // Cancel any ongoing search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // IMPROVED: Better preloading logic that doesn't interfere with search
    if (searchValue.length >= 2) {
      // Clear any existing preload timeout
      if (this.preloadTimeout) {
        clearTimeout(this.preloadTimeout);
        this.preloadTimeout = null;
      }

      // Schedule preload with better timing
      this.preloadTimeout = setTimeout(() => {
        // Double-check the search value is still current and user isn't searching
        if (
          this.searchInputValue.trim() === searchValue &&
          searchValue.length >= 2 &&
          !this.isSearching
        ) {
          this.triggerPreload(searchValue);
        }
        this.preloadTimeout = null;
      }, this.config.preloadDebounceMs);
    } else {
      // Clear preload timeout for searches less than 2 characters
      if (this.preloadTimeout) {
        clearTimeout(this.preloadTimeout);
        this.preloadTimeout = null;
      }
      if (searchValue === '') {
        this.lastSuccessfulPreload = '';
        this.pendingPreloadValue = '';
        this.preloadInProgress = false;
      }
    }

    // Always use debounced search for all cases (including empty)
    this.currentDebouncedSearch = debounce(() => {
      if (this.searchInputValue.trim() === searchValue) {
        this.searchRedirect(e, searchValue, searchTimestamp);
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
    this.config = { ...this.config, ...updates };

    // Refresh interval is now managed by the layout component
    // No need to restart intervals here
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
   * ENHANCED: Cleanup method with better resource management
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
      clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }

    // Clear typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = undefined;
    }

    // Reset all state including new performance tracking variables
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
    this.searchInputValue = '';
    this.searchQuery = '';
    this.openAccountDrawer = false;
    this.lastRefreshTime = 0;
    this.currentSearchTimestamp = 0;
    this.lastNavigationTimestamp = 0;
    this.lastUserInputTimestamp = 0;
    this.isUserTyping = false;
    this.lastSuccessfulPreload = '';
    this.pendingPreloadValue = '';
    this.preloadInProgress = false;
    this.wasInternalNavigation = false;
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
