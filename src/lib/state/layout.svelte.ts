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

  // Search state
  currentDebouncedSearch: ReturnType<typeof debounce> | null;

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
  currentDebouncedSearch = $state<ReturnType<typeof debounce> | null>(null);

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

    if (input.value === "") {
      goto(`/`, { keepFocus: true });
    } else {
      goto(`/search/${encodeURIComponent(input.value)}`, {
        keepFocus: true,
      });
    }
    return e;
  }

  handleSearch(e: Event) {
    if (this.currentDebouncedSearch?.isPending) {
      this.currentDebouncedSearch.clear();
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
    // Set up auth state change listener
    const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
      // Get current session from somewhere (you'll need to pass this in)
      // For now, we'll assume it's available globally or passed in
      // if (newSession?.expires_at !== session?.expires_at) {
      invalidate("supabase:auth");
      // }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }

  async setupStreamingNotifications() {
    const streamingSources = source("/api/twitch").select(
      "streamingSubscriptions",
    );

    // Flag for not displaying messages on initial page mount
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
}

const DEFAULT_KEY = "$_layout_state";

export function setLayoutState(key = DEFAULT_KEY) {
  const layoutState = new LayoutStateClass();
  return setContext(key, layoutState);
}

export function getLayoutState(key = DEFAULT_KEY) {
  return getContext<LayoutState>(key);
}
