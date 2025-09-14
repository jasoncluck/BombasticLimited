import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
import { invalidateAll } from '$app/navigation';
import { showToast } from '$lib/state/notifications.svelte.js';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { UserProfile } from '$lib/supabase/user-profiles';
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
 * Navigation state interface - simplified for search delegation
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

  // Simplified search state - URL tracking only
  searchQuery: string; // What's in the URL
  isSearching: boolean; // For UI feedback

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
  goto: (url: string, opts?: any) => Promise<void>;
  handleHomeNavigation: (event: Event, href?: string) => Promise<void>;
  handleNavigation: (event: Event, item: NavigationItem) => Promise<void>;

  // Search methods - simplified
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
 * Simplified navigation state class with search delegation
 */
export class NavigationStateClass implements NavigationState {
  // Private tracking variables
  private refreshInterval: number | null = null;
  private lastRefreshTime: number = 0;

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

  // Simplified search state - only URL tracking
  searchQuery = $state(''); // What's in the URL
  isSearching = $state(false); // For UI feedback only

  // Configuration
  config = $state<NavigationConfig>({
    enableHomeNavigation: true,
    enableBrandLogo: true,
    homeRouteReplaceState: true,
    searchDebounceMs: 400,
    preloadDebounceMs: 125,
    notificationRefreshIntervalMs: 5 * 60 * 1000, // 5 minutes
  });

  // User context
  session = $state<Session | null>(null);
  userProfile = $state<UserProfile | null>(null);
  supabase = $state<SupabaseClient<Database> | null>(null);

  // Account drawer state
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
      if (this.session && this.#hasLoadedOnce) {
        const now = Date.now();
        const timeSinceLastRefresh = now - this.lastRefreshTime;

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
   * Extract search query from URL
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
   * Simplified URL sync - just tracks URL state
   */
  syncSearchQueryFromUrl = (pathname: string): void => {
    const urlSearchQuery = this.extractSearchFromUrl(pathname);
    this.searchQuery = urlSearchQuery;
  };

  // Simplified goto wrapper
  goto = async (url: string, opts: any = {}) => {
    await goto(url, opts);
  };

  // Initialize effects
  initializeEffects() {
    if (browser) {
      $effect(() => {
        if (this.data?.navigationItems) {
          this.navigationItems = [...this.data.navigationItems];
        }
      });

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

  initialize = async (): Promise<() => void> => {
    if (this.#initialized) {
      return () => {};
    }

    await this.loadData();
    this.#initialized = true;

    if (this.session) {
      this.startRefreshInterval();
    }

    return () => {
      this.cleanup();
    };
  };

  initializeNonBlocking = (): (() => void) => {
    if (this.#initialized) {
      return () => {};
    }

    this.#initialized = true;
    this.loading = false;

    if (browser) {
      this.loadDataInBackground();
    }

    return () => {
      this.cleanup();
    };
  };

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

  updateActiveRoute(pathname: string): void {
    this.activeRoute = pathname;
  }

  getNavigationItem(id: string): NavigationItem | null {
    return this.navigationItems.find((item) => item.id === id) || null;
  }

  isNavigationItemActive(item: NavigationItem): boolean {
    if (item.isActive) {
      return item.isActive(this.activeRoute);
    }
    return this.activeRoute === item.href;
  }

  async handleHomeNavigation(event: Event, href: string = '/'): Promise<void> {
    if (!browser) return;

    event.preventDefault();
    this.isNavigating = true;

    try {
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

  async handleLogout(): Promise<void> {
    if (!this.supabase) {
      console.error('Supabase client not available for logout');
      return;
    }

    try {
      this.stopRefreshInterval();
      const { error } = await this.supabase.auth.signOut();

      if (error) {
        console.error('Error signing out:', error);
        showToast('Error logging out', 'error');
        return;
      }

      showToast('Logged out successfully', 'success');
      this.refreshData();
      await invalidateAll();
      await goto('/', { replaceState: true });
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Error during logout', 'error');
      if (browser && window) {
        window.location.href = '/';
      }
    }
  }

  // Simplified clear - just clears URL state
  clearSearchQuery = (): void => {
    this.searchQuery = '';
  };

  toggleAccountDrawer(): void {
    this.openAccountDrawer = !this.openAccountDrawer;
  }

  setAccountDrawer(open: boolean): void {
    this.openAccountDrawer = open;
  }

  updateConfig(updates: Partial<NavigationConfig>): void {
    const oldInterval = this.config.notificationRefreshIntervalMs;
    this.config = { ...this.config, ...updates };

    if (
      updates.notificationRefreshIntervalMs &&
      updates.notificationRefreshIntervalMs !== oldInterval &&
      this.refreshInterval
    ) {
      this.stopRefreshInterval();
      this.startRefreshInterval();
    }
  }

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

  removeNavigationItem(id: string): void {
    this.navigationItems = this.navigationItems.filter(
      (item) => item.id !== id
    );
  }

  // Data loading methods (unchanged)
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

  get isDataLoaded(): boolean {
    return this.data !== null && !this.loading;
  }

  get hasError(): boolean {
    return this.error !== null;
  }

  get showPlaceholder(): boolean {
    return this.#initialized && !this.#hasLoadedOnce && !this.hasError;
  }

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

  cleanup(): void {
    this.stopRefreshInterval();
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
  }
}

const DEFAULT_KEY = '$_navigation_state';

export function setNavigationState(key = DEFAULT_KEY): NavigationStateClass {
  const navigationState = new NavigationStateClass();
  return setContext(key, navigationState);
}

export function getNavigationState(key = DEFAULT_KEY): NavigationState {
  return getContext<NavigationState>(key);
}
