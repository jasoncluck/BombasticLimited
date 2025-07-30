<script lang="ts">
  import { Circle, ListVideo, Loader, Plus } from "@lucide/svelte";
  import { type SupabaseClient, type Session } from "@supabase/supabase-js";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";
  import * as Popover from "$lib/components/ui/popover";
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { goto, invalidate, preloadData } from "$app/navigation";
  import { navigating } from "$app/state";
  import { getContentState } from "$lib/state/content.svelte";
  import { getPlaylistState } from "$lib/state/playlist.svelte";
  import { page } from "$app/state";
  import { updateProfileSources } from "$lib/supabase/user-profiles";
  import { showNotification } from "$lib/stores/notification";
  import { getSourceState } from "$lib/state/source.svelte";
  import { getSidebarState } from "$lib/state/sidebar.svelte";
  import Button, { buttonVariants } from "../ui/button/button.svelte";
  import PlaylistContextMenu from "../playlist/playlist-context-menu.svelte";
  import { handleCreatePlaylist } from "../playlist/playlist-service";
  import type { Playlist } from "$lib/supabase/playlists";
  import { SvelteMap } from "svelte/reactivity";

  let {
    supabase,
    session,
    isSidebarCollapsed,
    refreshSidebar,
  }: {
    supabase: SupabaseClient;
    session: Session | null;
    isSidebarCollapsed: boolean;
    refreshSidebar?: () => Promise<void>;
  } = $props();

  const selectedSource = $derived(page.params.source);
  const selectedPlaylistIdParam = $derived(page.params.shortId);

  const contentState = getContentState();
  const playlistState = getPlaylistState();
  const sourceState = getSourceState();
  const sidebarState = getSidebarState();
  const { userProfile } = $derived(sidebarState);

  // Single selection state for both sources and playlists
  type SelectionState = {
    type: "source" | "playlist";
    value: string;
  } | null;

  let localSelection = $state<SelectionState>(null);

  // Compute current selection from URL params
  const urlSelection = $derived.by<SelectionState>(() => {
    if (selectedPlaylistIdParam) {
      return { type: "playlist", value: selectedPlaylistIdParam };
    } else if (selectedSource) {
      return { type: "source", value: selectedSource };
    }
    return null;
  });

  // Effective selection state (local takes precedence)
  const effectiveSelection = $derived(localSelection ?? urlSelection);

  // Memoized selection maps for better performance
  const sourceSelectionMap = $derived(() => {
    const map = new SvelteMap<string, boolean>();
    if (effectiveSelection?.type === "source") {
      map.set(effectiveSelection.value, true);
    }
    return map;
  });

  const playlistSelectionMap = $derived(() => {
    const map = new SvelteMap<string, boolean>();
    if (effectiveSelection?.type === "playlist") {
      map.set(effectiveSelection.value, true);
    }
    return map;
  });

  // Optimized helper functions to check selection state
  const isSourceSelected = (source: string) =>
    sourceSelectionMap().get(source) ?? false;

  const isPlaylistSelected = (playlistShortId: string) =>
    playlistSelectionMap().get(playlistShortId) ?? false;

  // Reset local state when URL params change (navigation completed)
  $effect(() => {
    // If the URL selection has caught up to our local selection, clear the local state
    if (localSelection && urlSelection) {
      if (
        localSelection.type === urlSelection.type &&
        localSelection.value === urlSelection.value
      ) {
        localSelection = null;
      }
    } else if (!urlSelection && localSelection) {
      // If we have local selection but no URL selection, keep local state
      // This handles cases where navigation might be in progress
    } else if (urlSelection && !localSelection) {
      // URL changed without local selection (e.g., back/forward navigation)
      // No action needed, urlSelection will be used
    }
  });

  // Local state for sources ordering
  let orderedSources = $derived(userProfile?.sources ?? [...SOURCES]);

  // Source drag and drop state
  let draggedSourceIndex = $state<number | null>(null);
  let targetSourceIndex = $state<number | null>(null);

  // Create drag and drop handlers for playlists
  const dragDropHandlers = $derived(
    playlistState.createPlaylistDragDrop({
      playlists: sidebarState.playlists ?? [],
      supabase,
      session,
      onPlaylistsUpdate: (updatedPlaylists) => {
        sidebarState.playlists = updatedPlaylists;
      },
    }),
  );

  // Enhanced source click handler with immediate UI update and performance monitoring
  function handleSourceClick(source: string) {
    // Performance monitoring (optional - remove in production if not needed)
    performance.mark("source-click-start");

    // Update UI state immediately for instant feedback
    localSelection = { type: "source", value: source };

    // Defer navigation to prevent blocking UI updates
    requestAnimationFrame(() => {
      goto(`/${source}`);
      performance.mark("source-navigation-started");
      performance.measure(
        "source-ui-update",
        "source-click-start",
        "source-navigation-started",
      );
    });
  }

  // Enhanced playlist click handler with immediate UI update and deferred navigation
  function handlePlaylistClick(playlist: Playlist) {
    // Performance monitoring (optional - remove in production if not needed)
    performance.mark("playlist-click-start");

    // Update UI state immediately for instant feedback
    localSelection = { type: "playlist", value: playlist.short_id };

    // Defer the heavy navigation operation to prevent blocking UI updates
    requestAnimationFrame(() => {
      goto(`/playlist/${encodeURI(playlist.short_id)}`, {
        // Optional navigation optimizations
        noScroll: false, // Set to true if you don't want to scroll to top
        keepFocus: false, // Set to true to keep focus on current element
      });
      performance.mark("playlist-navigation-started");
      performance.measure(
        "playlist-ui-update",
        "playlist-click-start",
        "playlist-navigation-started",
      );
    });
  }

  // Preload playlist route on hover for better perceived performance
  function handlePlaylistHover(playlist: Playlist, index: number) {
    playlistState.handleMouseEnter(index);

    // Preload the route data for faster navigation
    preloadData(`/playlist/${encodeURI(playlist.short_id)}`);
  }

  // Source drag and drop handlers
  function handleSourceDragStart(event: DragEvent, index: number) {
    // Prevent any drag behavior if session is null
    if (!session) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    draggedSourceIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function handleSourceDragOver(event: DragEvent, index: number) {
    // Don't allow drag over if session is null
    if (!session) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    event.preventDefault();
    if (
      draggedSourceIndex !== null &&
      draggedSourceIndex !== index &&
      targetSourceIndex !== index
    ) {
      targetSourceIndex = index;
    }
  }

  function handleSourceDragLeave(event: DragEvent) {
    // Don't handle drag leave if session is null
    if (!session) {
      return false;
    }

    const relatedTarget = event.relatedTarget as Node;
    if (
      event.currentTarget instanceof HTMLElement &&
      !event.currentTarget.contains(relatedTarget)
    ) {
      targetSourceIndex = null;
    }
  }

  async function handleSourceDrop(event: DragEvent, dropIndex: number) {
    // Don't allow drop if session is null
    if (!session) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    event.preventDefault();

    if (draggedSourceIndex === null || draggedSourceIndex < 0) {
      return;
    }

    // Reorder the sources array
    const newOrderedSources = [...orderedSources];
    const [movedSource] = newOrderedSources.splice(draggedSourceIndex, 1);
    newOrderedSources.splice(dropIndex, 0, movedSource);

    // Only update if the order actually changed
    if (JSON.stringify(newOrderedSources) !== JSON.stringify(orderedSources)) {
      orderedSources = newOrderedSources;

      if (session?.user.id) {
        try {
          await updateProfileSources({
            sources: orderedSources,
            supabase,
            session,
          });
          // Refresh sidebar to get updated profile
          await refreshSidebar?.();
        } catch (error) {
          console.error("Failed to update source ordering:", error);
          showNotification("An error occurred, unable to reorder.");
          // Optionally revert the order on error
          orderedSources = [...SOURCES];
        }
        invalidate("supabase:db:profiles");
      }
    }
  }

  function handleSourceDragEnd() {
    // Only reset state if session exists
    if (!session) {
      return false;
    }

    draggedSourceIndex = null;
    targetSourceIndex = null;
  }

  // Helper function to get source drag classes
  function getSourceDragClasses(index: number): string {
    let classes = "relative";
    if (!session) {
      return classes;
    }

    if (draggedSourceIndex === index) {
      classes += " opacity-60";
    }

    if (targetSourceIndex === index) {
      if (
        draggedSourceIndex === null ||
        draggedSourceIndex < targetSourceIndex
      ) {
        // Show indicator at the bottom
        classes +=
          " after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10";
      } else {
        // Show indicator at the top
        classes +=
          " before:absolute before:left-0 before:-top-0 before:w-full before:h-[2px] before:bg-primary before:z-10";
      }
    }
    return classes;
  }
</script>

<aside class="h-full overflow-hidden">
  <div class="flex flex-col {!isSidebarCollapsed ? 'mx-2' : 'mx-1'}">
    {#each orderedSources as source, i (source)}
      {@const isSelected = isSourceSelected(source)}
      {@const buttonClasses = sourceState.getButtonClasses({
        index: i,
        isSelected,
        isSidebarCollapsed,
      })}

      <Button
        variant="ghost"
        draggable={!!session}
        class="{buttonClasses} {getSourceDragClasses(i)}"
        size={!isSidebarCollapsed ? "default" : "icon"}
        onclick={() => handleSourceClick(source)}
        title={SOURCE_INFO[source].displayName}
        onmouseenter={() => sourceState.handleMouseEnter(i)}
        onmouseleave={() => sourceState.handleMouseLeave(i)}
        ondragstart={(e) => handleSourceDragStart(e, i)}
        ondragover={(e) => handleSourceDragOver(e, i)}
        ondragleave={(e) => handleSourceDragLeave(e)}
        ondrop={(e) => handleSourceDrop(e, i)}
        ondragend={handleSourceDragEnd}
      >
        <div
          class="flex items-center grow absolute
                    {!isSidebarCollapsed ? 'grow w-full' : 'item-center'}"
        >
          {#if activeStreams.sources.includes(source)}
            <Circle
              class="absolute left-0 bottom-0"
              fill="#eb0400"
              strokeWidth={0}
            />
          {/if}
          <span class="sr-only">Live now</span>

          <div class="h-12 w-12 shrink-0">
            <img
              src={SOURCE_INFO[source].image}
              alt={SOURCE_INFO[source].displayName}
              class="h-full w-full object-cover cursor-pointer"
            />
          </div>
          {#if !isSidebarCollapsed}
            <span
              class="text-sm mr-6 px-3 text-wrap text-left justify-start max-h-10 overflow-hidden"
            >
              {SOURCE_INFO[source].displayName}
            </span>
          {/if}
        </div>
      </Button>
    {/each}
  </div>
  <hr class="m-2" />
  <div
    class="flex flex-col m-3 {!isSidebarCollapsed
      ? 'items-start mx-6'
      : 'items-center'}"
  >
    <div class="flex items-center h-[44px]">
      {#if !session?.user.id}
        <Popover.Root>
          <Popover.Trigger
            class={buttonVariants({
              variant: "secondary",
              size: "icon",
              class: "my-1 rounded-full cursor-pointer",
            })}
          >
            <Plus />
          </Popover.Trigger>
          <Popover.Content
            >Create an account or login to use playlists.</Popover.Content
          >
        </Popover.Root>
      {:else}
        <Button
          variant="secondary"
          title="Create Playlist"
          class="my-1 rounded-full cursor-pointer"
          size="icon"
          onclick={() =>
            handleCreatePlaylist({ sidebarState, supabase, session })}
        >
          <Plus />
        </Button>
      {/if}
      {#if !isSidebarCollapsed}
        <h2 class="ml-4 text-lg font-semibold tracking-tight">Playlists</h2>
      {/if}
    </div>
  </div>

  <div
    class="border-2 rounded-md transition-colors duration-150 {!isSidebarCollapsed
      ? 'mx-2'
      : 'mx-1'}
    {sidebarState.playlists.length > 0 &&
    contentState.dragContentType === 'video'
      ? 'border-secondary/80'
      : 'border-transparent'}"
  >
    <div class="flex flex-col">
      {#if sidebarState.playlists === null}
        <Loader class="animate-spin w-full" />
      {:else if session && sidebarState.playlists.length > 0}
        <div class="flex flex-col">
          {#each sidebarState.playlists as playlist, i (playlist.id)}
            {@const isSelected = isPlaylistSelected(playlist.short_id)}
            {@const buttonClasses = playlistState.getButtonClasses({
              index: i,
              isSelected,
              itemType: "playlist",
              isSidebarCollapsed,
              playlists: sidebarState.playlists,
              selectedPlaylistIdParam:
                effectiveSelection?.type === "playlist"
                  ? effectiveSelection.value
                  : undefined,
              session,
            })}

            <PlaylistContextMenu
              {playlist}
              {selectedPlaylistIdParam}
              {isSidebarCollapsed}
              {supabase}
              {session}
            >
              <Button
                variant="ghost"
                draggable={true}
                class={buttonClasses}
                size={!isSidebarCollapsed ? "default" : "icon"}
                onclick={() => handlePlaylistClick(playlist)}
                title={playlist.name}
                value={playlist.name}
                onmouseenter={() => handlePlaylistHover(playlist, i)}
                onmouseleave={() => playlistState.handleMouseLeave(i)}
                ondragstart={(e) => dragDropHandlers.handleDragStart(e, i)}
                ondragover={(e) => dragDropHandlers.handleDragOver(e, i)}
                ondragleave={(e) => dragDropHandlers.handleDragLeave(e, i)}
                ondrop={(e) => dragDropHandlers.handleDrop(e, i)}
                ondragend={dragDropHandlers.handleDragEnd}
              >
                <div
                  class="flex items-center grow absolute
                    {!isSidebarCollapsed ? 'grow w-full' : 'item-center'}"
                >
                  {#if playlist.processedImageUrl}
                    <div class="h-12 w-12 shrink-0">
                      <img
                        src={playlist.processedImageUrl}
                        class="h-full w-full object-cover cursor-pointer"
                        alt={`Image for playlist: ${playlist.name}`}
                      />
                    </div>
                  {:else}
                    <div
                      class="h-12 w-12 flex-shrink-0 flex items-center justify-center"
                    >
                      <ListVideo class="!h-8 !w-8" />
                    </div>
                  {/if}
                  {#if !isSidebarCollapsed}
                    <span
                      class="text-sm mr-6 px-3 text-wrap text-left justify-start max-h-10 overflow-hidden"
                    >
                      {playlist.name}
                    </span>
                  {/if}
                </div>

                <!-- Optional: Show loading state during navigation -->
                {#if navigating?.to?.url.pathname.includes(playlist.short_id)}
                  <div
                    class="absolute inset-0 bg-black/10 flex items-center justify-center rounded"
                  >
                    <Loader class="w-4 h-4 animate-spin text-primary" />
                  </div>
                {/if}
              </Button>
            </PlaylistContextMenu>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</aside>
