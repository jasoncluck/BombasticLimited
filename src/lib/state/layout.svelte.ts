import { getContext, setContext } from 'svelte';
import { goto, invalidate } from '$app/navigation';
import { showNotification } from '$lib/stores/notification.js';
import debounce from 'debounce';
import { page } from '$app/state';
import { isSourceArray, SOURCE_INFO } from '$lib/constants/source';
import { activeStreams } from '$lib/state/streaming.svelte';
import type { SupabaseClient } from '@supabase/supabase-js';
import { source } from 'sveltekit-sse';
import { browser } from '$app/environment';

export interface LayoutConfig {
  searchDebounceMs: number;
}

// Unified layout and sidebar state for persistence
export interface UnifiedLayoutState {
  panes: number[];
  sidebarCollapsed: boolean;
}

export interface LayoutState {
  // UI State
  isDraggingDivider: boolean;
  isSearching: boolean;
  isSidebarCollapsed: boolean; // Add sidebar collapse state

  // Search state
  currentDebouncedSearch: ReturnType<typeof debounce> | null;
  searchAbortController: AbortController | null;

  // Configuration
  config: LayoutConfig;

  // Navigation methods
  handleLogout: (supabase: SupabaseClient) => Promise<void>;
  searchRedirect: (e: Event) => Promise<Event>;
  handleSearch: (e: Event) => void;

  // Layout methods
  onLayoutChange: (sizes: number[]) => void;

  // Sidebar methods
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Unified persistence methods
  saveUnifiedLayoutState: (sizes: number[], sidebarCollapsed: boolean) => void;
  loadUnifiedLayoutState: () => UnifiedLayoutState | null;

  // Notification setup
  setupNotifications: (supabase: SupabaseClient) => () => void;
  setupStreamingNotifications: () => void;

  // Cleanup method
  cleanup: () => void;
}

export class LayoutStateClass implements LayoutState {
  private lastSearchValue: string = '';

  isDraggingDivider = $state(false);
  isSearching = $state(false);
  isSidebarCollapsed = $state(false);
  currentDebouncedSearch = $state<ReturnType<typeof debounce> | null>(null);
  searchAbortController = $state<AbortController | null>(null);

  config = $state<LayoutConfig>({
    searchDebounceMs: 400,
  });

  constructor() {
    // Initialize sidebar state from unified layout state on construction
    this.loadInitialState();
  }

  private loadInitialState(): void {
    const unifiedState = this.loadUnifiedLayoutState();
    if (unifiedState) {
      this.isSidebarCollapsed = unifiedState.sidebarCollapsed;
    }
  }

  /**
   * Load unified layout state from cookie
   */
  loadUnifiedLayoutState(): UnifiedLayoutState | null {
    if (!browser && typeof document === 'undefined') return null;

    try {
      const cookies = document.cookie.split(';');
      const layoutCookie = cookies.find((cookie) =>
        cookie.trim().startsWith('PaneForge:layout=')
      );

      if (layoutCookie) {
        const cookieValue = layoutCookie.split('=')[1];
        const parsed = JSON.parse(decodeURIComponent(cookieValue));
        
        // Handle the new unified format
        if (parsed && typeof parsed === 'object' && parsed.panes && Array.isArray(parsed.panes)) {
          return {
            panes: parsed.panes,
            sidebarCollapsed: parsed.sidebarCollapsed ?? false
          };
        }
        
        // Handle legacy format (just array of numbers)
        if (Array.isArray(parsed)) {
          return {
            panes: parsed,
            sidebarCollapsed: false // Default to expanded for legacy
          };
        }
      }
    } catch (error) {
      console.error('Failed to load unified layout state from cookie:', error);
    }

    return null;
  }

  /**
   * Save unified layout state to cookie
   */
  saveUnifiedLayoutState(sizes: number[], sidebarCollapsed: boolean): void {
    if (!browser && typeof document === 'undefined') return;

    const unifiedState: UnifiedLayoutState = {
      panes: sizes,
      sidebarCollapsed
    };

    try {
      const cookieValue = JSON.stringify(unifiedState);
      const hostname = page?.url?.hostname || 'localhost';
      document.cookie = `PaneForge:layout=${cookieValue}; path=/; domain=${hostname}; max-age=31536000`; // 1 year expiry
    } catch (error) {
      console.error('Failed to save unified layout state to cookie:', error);
    }
  }

  setSidebarCollapsed = (collapsed: boolean): void => {
    this.isSidebarCollapsed = collapsed;
    // Update the unified state with current pane sizes
    const currentState = this.loadUnifiedLayoutState();
    const currentPanes = currentState?.panes || [15, 85]; // Default pane sizes
    this.saveUnifiedLayoutState(currentPanes, collapsed);
  };

  toggleSidebar = (): void => {
    this.setSidebarCollapsed(!this.isSidebarCollapsed);
  };

  async handleLogout(supabase: SupabaseClient) {
    const { error } = await supabase.auth.signOut();
    showNotification('Logged out.', 'success');
    if (error) {
      console.error('Error signing out:', error);
    }
    window.location.reload();
  }

  async searchRedirect(e: Event, expectedValue?: string): Promise<Event> {
    const input = e.target as HTMLInputElement;
    const searchValue = input.value.trim();

    // If an expected value was passed and current value doesn't match, abort
    if (expectedValue !== undefined && searchValue !== expectedValue) {
      return e; // Return the event instead of undefined
    }

    // Cancel any pending search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    this.isSearching = true;

    try {
      if (searchValue === '') {
        // Only navigate to "/" if completely empty
        goto(`/`, { keepFocus: true });
      } else if (searchValue.length >= 2) {
        // Only navigate to search if 2+ characters
        // Create new abort controller for this search
        this.searchAbortController = new AbortController();

        goto(`/search/${encodeURIComponent(searchValue)}`, {
          keepFocus: true,
        });
      }
      // For single characters (length === 1), do nothing - stay on current page
    } catch (error) {
      // Don't log abort errors - they're expected
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Search navigation error:', error);
      }
    } finally {
      this.isSearching = false;
      this.searchAbortController = null;
    }

    return e; // Always return the event to match the base class signature
  }

  handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;
    const searchValue = input.value.trim();

    // Cancel current debounced search if it exists
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }

    // Cancel any ongoing search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // If we're starting from empty and hit the minimum threshold, search immediately
    // This makes the first search more responsive
    if (searchValue.length === 2 && !this.lastSearchValue) {
      this.lastSearchValue = searchValue;
      this.searchRedirect(e, searchValue);
      return;
    }

    // For all cases, use debounced search (including empty and single character)
    // Capture the search value at the time of creating the debounced function
    const capturedSearchValue = searchValue;
    this.currentDebouncedSearch = debounce(() => {
      this.lastSearchValue = capturedSearchValue;
      this.searchRedirect(e, capturedSearchValue);
    }, this.config.searchDebounceMs);
    this.currentDebouncedSearch();
  }

  onLayoutChange(sizes: number[]) {
    // Save both pane sizes and current sidebar collapsed state
    this.saveUnifiedLayoutState(sizes, this.isSidebarCollapsed);
  }

  setupNotifications(supabase: SupabaseClient) {
    const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
      invalidate('supabase:auth');
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }

  async setupStreamingNotifications() {
    const streamingSources = source('/api/twitch').select(
      'streamingSubscriptions'
    );

    let initialMount = true;

    const unsubscribe = streamingSources.subscribe((latestStreamingSources) => {
      let latestStreamingSourcesParsed;

      try {
        latestStreamingSourcesParsed = JSON.parse(latestStreamingSources);
      } catch {
        return;
      }

      if (isSourceArray(latestStreamingSourcesParsed)) {
        const removedSources = activeStreams.sources.filter(
          (source) => !latestStreamingSourcesParsed.includes(source)
        );
        const addedSources = latestStreamingSourcesParsed.filter(
          (source) => !activeStreams.sources.includes(source)
        );

        if (!initialMount) {
          removedSources.forEach((removedSource) => {
            showNotification(
              `${SOURCE_INFO[removedSource].displayName} has ended their stream.`
            );
          });

          addedSources.forEach((addedSource) => {
            showNotification(
              `${SOURCE_INFO[addedSource].displayName} has started streaming.`
            );
          });
        }

        activeStreams.sources = latestStreamingSourcesParsed;
      }
      initialMount = false;
    });

    return unsubscribe;
  }

  cleanup() {
    // Cancel any pending search operations
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // Reset search state but preserve sidebar collapsed state
    this.isSearching = false;
    this.isDraggingDivider = false;
    // Note: Don't reset isSidebarCollapsed - it should persist across page refreshes
  }
}

const DEFAULT_KEY = '$_layout_state';

export function setLayoutState(key = DEFAULT_KEY) {
  const layoutState = new LayoutStateClass();
  return setContext(key, layoutState);
}

export function getLayoutState(key = DEFAULT_KEY) {
  return getContext<LayoutState>(key);
}
