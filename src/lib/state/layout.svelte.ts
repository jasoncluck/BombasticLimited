import { getContext, setContext } from "svelte";
import { goto, invalidate } from "$app/navigation";
import { showNotification } from "$lib/stores/notification.js";
import debounce from "debounce";
import { page } from "$app/state";
import { isSourceArray, SOURCE_INFO } from "$lib/constants/source";
import { activeStreams } from "$lib/state/streaming.svelte";
import type { SupabaseClient } from "@supabase/supabase-js";
import { source } from "sveltekit-sse";

export interface LayoutConfig {
  searchDebounceMs: number;
}

export interface LayoutState {
  // UI State
  isDraggingDivider: boolean;
  isSearching: boolean; // NEW: Track search state

  // Search state
  currentDebouncedSearch: ReturnType<typeof debounce> | null;
  searchAbortController: AbortController | null; // NEW: For canceling requests

  // Configuration
  config: LayoutConfig;

  // Navigation methods
  handleLogout: (supabase: SupabaseClient) => Promise<void>;
  searchRedirect: (e: Event) => Promise<Event>;
  handleSearch: (e: Event) => void;

  // Layout methods
  onLayoutChange: (sizes: number[]) => void;

  // Notification setup
  setupNotifications: (supabase: SupabaseClient) => () => void;
  setupStreamingNotifications: () => void;
}

export class LayoutStateClass implements LayoutState {
  isDraggingDivider = $state(false);
  isSearching = $state(false); // NEW
  currentDebouncedSearch = $state<ReturnType<typeof debounce> | null>(null);
  searchAbortController = $state<AbortController | null>(null); // NEW

  config = $state<LayoutConfig>({
    searchDebounceMs: 500,
  });

  async handleLogout(supabase: SupabaseClient) {
    const { error } = await supabase.auth.signOut();
    showNotification("Logged out.", "success");
    if (error) {
      console.error("Error signing out:", error);
    }
    window.location.reload();
  }

  async searchRedirect(e: Event) {
    const input = e.target as HTMLInputElement;
    const searchValue = input.value.trim();

    // Cancel any pending search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    this.isSearching = true;

    try {
      if (searchValue === "") {
        await goto(`/`, { keepFocus: true, replaceState: true });
      } else {
        // Create new abort controller for this search
        this.searchAbortController = new AbortController();

        // Use replaceState instead of pushState for rapid searches to avoid history pollution
        const shouldReplace = window.location.pathname.startsWith("/search/");

        await goto(`/search/${encodeURIComponent(searchValue)}`, {
          keepFocus: true,
          replaceState: true,
        });
      }
    } catch (error) {
      // Don't log abort errors - they're expected
      if ((error as Error)?.name !== "AbortError") {
        console.error("Search navigation error:", error);
      }
    } finally {
      this.isSearching = false;
      this.searchAbortController = null;
    }

    return e;
  }

  handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;

    // Cancel current debounced search if it exists
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }

    // Cancel any ongoing search request
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    // Don't search for very short queries
    if (input.value.trim().length > 0 && input.value.trim().length < 2) {
      return;
    }

    this.currentDebouncedSearch = debounce(
      () => this.searchRedirect(e),
      this.config.searchDebounceMs,
    );
    this.currentDebouncedSearch();
  }

  onLayoutChange(sizes: number[]) {
    document.cookie = `PaneForge:layout=${JSON.stringify(sizes)}; path=/; domain=${page.url.hostname}`;
  }

  setupNotifications(supabase: SupabaseClient) {
    const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
      invalidate("supabase:auth");
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }

  async setupStreamingNotifications() {
    const streamingSources = source("/api/twitch").select(
      "streamingSubscriptions",
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
          (source) => !latestStreamingSourcesParsed.includes(source),
        );
        const addedSources = latestStreamingSourcesParsed.filter(
          (source) => !activeStreams.sources.includes(source),
        );

        if (!initialMount) {
          removedSources.forEach((removedSource) => {
            showNotification(
              `${SOURCE_INFO[removedSource].displayName} has ended their stream.`,
            );
          });

          addedSources.forEach((addedSource) => {
            showNotification(
              `${SOURCE_INFO[addedSource].displayName} has started streaming.`,
            );
          });
        }

        activeStreams.sources = latestStreamingSourcesParsed;
      }
      initialMount = false;
    });

    return unsubscribe;
  }

  // NEW: Cleanup method
  cleanup() {
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
    }
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }
  }
}

const DEFAULT_KEY = "$_layout_state";

export function setLayoutState(key = DEFAULT_KEY) {
  const layoutState = new LayoutStateClass();
  return setContext(key, layoutState);
}

export function getLayoutState(key = DEFAULT_KEY) {
  return getContext<LayoutState>(key);
}
