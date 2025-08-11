import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
import { showToast } from '$lib/state/notifications.svelte.js';
import debounce from 'debounce';
import { isSourceArray, SOURCE_INFO } from '$lib/constants/source';
import type { SupabaseClient } from '@supabase/supabase-js';
import { source } from 'sveltekit-sse';
import { browser } from '$app/environment';

export interface LayoutConfig {
  searchDebounceMs: number;
}

export interface LayoutState {
  // UI State
  isDraggingDivider: boolean;
  isSearching: boolean;
  isSidebarCollapsed: boolean;

  // Search state
  currentDebouncedSearch: ReturnType<typeof debounce> | null;
  searchAbortController: AbortController | null;

  // Configuration
  config: LayoutConfig;

  // Navigation methods
  handleLogout: (supabase: SupabaseClient) => Promise<void>;
  searchRedirect: (e: Event) => Promise<Event>;
  handleSearch: (e: Event) => void;

  // Sidebar methods
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

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
    searchDebounceMs: 250,
  });

  constructor() {
    // Initialize sidebar state from localStorage on construction
    this.loadSidebarState();
  }

  private loadSidebarState(): void {
    if (!browser) return;

    try {
      const saved = localStorage.getItem('bombastic-sidebar-collapsed');
      if (saved !== null) {
        this.isSidebarCollapsed = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load sidebar state:', error);
    }
  }

  private saveSidebarState(collapsed: boolean): void {
    if (!browser) return;

    try {
      localStorage.setItem(
        'bombastic-sidebar-collapsed',
        JSON.stringify(collapsed)
      );
    } catch (error) {
      console.error('Failed to save sidebar state:', error);
    }
  }

  setSidebarCollapsed = (collapsed: boolean): void => {
    this.isSidebarCollapsed = collapsed;
    this.saveSidebarState(collapsed);
  };

  toggleSidebar = (): void => {
    this.setSidebarCollapsed(!this.isSidebarCollapsed);
  };

  async handleLogout(supabase: SupabaseClient) {
    const { error } = await supabase.auth.signOut();
    showToast('Logged out.', 'success');
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
