import type { Playlist } from "$lib/supabase/playlists";
import type { UserProfile } from "$lib/supabase/user-profiles";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import { getContext, setContext } from "svelte";
import { browser } from "$app/environment";
import type { Source } from "$lib/constants/source";

export interface SidebarData {
  playlists: Playlist[];
  followedPlaylists: Playlist[];
  userProfile: UserProfile;
  userPlaylistsCount: number;
}

export class SidebarStateClass {
  data = $state<SidebarData | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);
  #initialized = $state(false);

  // Derived values for easier access
  playlists = $derived(this.data?.playlists ?? []);
  userProfile = $derived(this.data?.userProfile ?? null);
  userPlaylistsCount = $derived(this.data?.userPlaylistsCount ?? 0);

  // UI state
  collapsed = $state(false);
  openAccountDrawer = $state(false);

  // Drag and drop state
  draggedSourceIndex = $state<number | null>(null);
  targetSourceIndex = $state<number | null>(null);

  // Source ordering state
  orderedSources = $state<Source[]>([]);

  constructor() {
    // Initialize ordered sources from user profile when data loads
    $effect(() => {
      if (this.data?.userProfile?.sources) {
        this.orderedSources = [...this.data.userProfile.sources];
      }
    });
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

  // Data loading methods
  async loadData(): Promise<void> {
    if (!browser) return;

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch("/api/sidebar");
      if (response.ok) {
        this.data = await response.json();
      } else {
        this.error = `Failed to load sidebar data: ${response.statusText}`;
        console.error(this.error);
      }
    } catch (error) {
      this.error = "Failed to load sidebar";
      console.error("Failed to load sidebar:", error);
    } finally {
      this.loading = false;
    }
  }

  async loadDataInBackground(): Promise<void> {
    if (!browser) return;

    // Don't show loading state for background loads
    this.error = null;

    try {
      const response = await fetch("/api/sidebar");
      if (response.ok) {
        this.data = await response.json();
      } else {
        this.error = `Failed to load sidebar data: ${response.statusText}`;
        console.error(this.error);
      }
    } catch (error) {
      this.error = "Failed to load sidebar";
      console.error("Failed to load sidebar:", error);
    }
  }

  async refreshData(): Promise<void> {
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
    return this.#initialized && !this.isDataLoaded && !this.hasError;
  }

  // Cleanup method
  cleanup(): void {
    // Reset all state
    this.data = null;
    this.loading = false;
    this.error = null;
    this.collapsed = false;
    this.openAccountDrawer = false;
    this.orderedSources = [];
    this.#initialized = false;
  }
}

// Export the class type for use elsewhere
export type SidebarState = SidebarStateClass;

const DEFAULT_KEY = "$_sidebar_state";

export function setSidebarState(key = DEFAULT_KEY) {
  const sidebarState = new SidebarStateClass();
  return setContext(key, sidebarState);
}

export function getSidebarState(key = DEFAULT_KEY) {
  return getContext<SidebarState>(key);
}
