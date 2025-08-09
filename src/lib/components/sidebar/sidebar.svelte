<script lang="ts">
  import { Circle, ListVideo, Loader, Plus } from '@lucide/svelte';
  import { type SupabaseClient, type Session } from '@supabase/supabase-js';
  import { SOURCE_INFO, SOURCES } from '$lib/constants/source';
  import * as Popover from '$lib/components/ui/popover';
  import { goto, invalidate } from '$app/navigation';
  import { getContentState } from '$lib/state/content.svelte';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { page } from '$app/state';
  import { updateProfileSources } from '$lib/supabase/user-profiles';
  import { showNotification } from '$lib/stores/notification';
  import { getSourceState } from '$lib/state/source.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { handleCreatePlaylist } from '../playlist/playlist-service';
  import Button, { buttonVariants } from '../ui/button/button.svelte';
  import PlaylistContextMenu from '../playlist/playlist-context-menu.svelte';
  import SidebarItem from './SidebarItem.svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import type { Playlist } from '$lib/supabase/playlists';
  import StreamingIndicator from '../streaming/streaming-indicator.svelte';

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

  // Single selection state - can be either a source or playlist
  type Selection =
    | { type: 'source'; value: string }
    | { type: 'playlist'; value: string }
    | null;

  let currentSelection = $derived.by<Selection>(() => {
    if (selectedPlaylistIdParam) {
      return { type: 'playlist', value: selectedPlaylistIdParam };
    } else if (selectedSource) {
      return { type: 'source', value: selectedSource };
    }
    return null;
  });

  // Local state for sources ordering with optimistic updates
  let orderedSources = $derived(userProfile?.sources ?? [...SOURCES]);

  // Sync with user profile when it loads
  $effect(() => {
    if (userProfile?.sources) {
      orderedSources = [...userProfile.sources];
    }
  });

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
    })
  );

  // Enhanced source selection with immediate feedback
  function handleSourceClick(source: string) {
    // Update selection immediately - this deselects any playlist
    currentSelection = { type: 'source', value: source };

    goto(`/${source}`);
  }

  // Enhanced playlist selection with immediate feedback
  function handlePlaylistClick(playlist: Playlist) {
    // Update selection immediately - this deselects any source
    currentSelection = { type: 'playlist', value: playlist.short_id };
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
  }

  // Source drag and drop handlers with optimistic updates
  function handleSourceDragStart(event: DragEvent, index: number) {
    if (!session) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    draggedSourceIndex = index;
    // Clear hover states to prevent CSS conflicts during drag
    sourceState.hoveredSourceIndex = null;

    // Add global dragging class to disable all CSS hover effects
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('dragging');
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleSourceDragOver(event: DragEvent, index: number) {
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
    if (!session) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    event.preventDefault();

    if (draggedSourceIndex === null || draggedSourceIndex < 0) {
      return;
    }

    // Store original order for potential rollback
    const originalOrder = [...orderedSources];

    // Update UI immediately (optimistic update)
    const newOrderedSources = [...orderedSources];
    const [movedSource] = newOrderedSources.splice(draggedSourceIndex, 1);
    newOrderedSources.splice(dropIndex, 0, movedSource);

    // Only update if the order actually changed
    if (JSON.stringify(newOrderedSources) !== JSON.stringify(orderedSources)) {
      orderedSources = newOrderedSources;

      if (session?.user.id) {
        try {
          // Update server in background
          await updateProfileSources({
            sources: orderedSources,
            supabase,
            session,
          });

          // Refresh sidebar to get updated profile
          await refreshSidebar?.();
          invalidate('supabase:db:profiles');
        } catch (error) {
          console.error('Failed to update source ordering:', error);
          showNotification('An error occurred, unable to reorder.');

          // Rollback on error
          orderedSources = originalOrder;
        }
      }
    }
  }

  function handleSourceDragEnd() {
    if (!session) {
      return false;
    }

    draggedSourceIndex = null;
    targetSourceIndex = null;

    // Remove global dragging class to re-enable CSS hover effects
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('dragging');
    }
  }

  // Helper function to get source drag classes
  function getSourceDragClasses(index: number): string {
    let classes = 'relative';
    if (!session) {
      return classes;
    }

    if (draggedSourceIndex === index) {
      classes += ' opacity-60';
    }

    if (targetSourceIndex === index) {
      if (
        draggedSourceIndex === null ||
        draggedSourceIndex < targetSourceIndex
      ) {
        classes +=
          ' after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10';
      } else {
        classes +=
          ' before:absolute before:left-0 before:-top-0 before:w-full before:h-[2px] before:bg-primary before:z-10';
      }
    }
    return classes;
  }

  // Helper function to check if source is selected
  function isSourceSelected(source: string): boolean {
    return (
      currentSelection?.type === 'source' && currentSelection.value === source
    );
  }

  // Helper function to check if playlist is selected
  function isPlaylistSelected(playlist: Playlist): boolean {
    return (
      currentSelection?.type === 'playlist' &&
      currentSelection.value === playlist.short_id
    );
  }
</script>

<aside class="h-full overflow-hidden">
  <div class="flex flex-col {!isSidebarCollapsed ? 'mx-2' : 'mx-1'}">
    {#if sidebarState.showPlaceholder}
      <!-- Skeleton sources when loading -->
      {#each Array(4)}
        <SidebarItem isLoading={true} {isSidebarCollapsed} />
      {/each}
    {:else}
      <!-- Real sources -->
      {#each orderedSources as source, i (source)}
        <Button
          variant="ghost"
          draggable={!!session}
          class="{sourceState.getButtonClasses({
            index: i,
            isSelected: isSourceSelected(source),
            isSidebarCollapsed,
          })} {getSourceDragClasses(i)}"
          size={!isSidebarCollapsed ? 'default' : 'icon'}
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
            class="absolute flex grow items-center
                      {!isSidebarCollapsed ? 'w-full grow' : 'item-center'}"
          >
            <StreamingIndicator
              isStreaming={sidebarState.isSourceStreaming(source)}
              size="sm"
            />
            <span class="sr-only">Live now</span>

            <div class="h-12 w-12 shrink-0">
              <enhanced:img
                src={SOURCE_INFO[source].image}
                alt={SOURCE_INFO[source].displayName}
                class="h-full w-full cursor-pointer object-cover"
              />
            </div>
            {#if !isSidebarCollapsed}
              <span
                class="mr-6 max-h-10 justify-start overflow-hidden px-3 text-left text-sm text-wrap"
              >
                {SOURCE_INFO[source].displayName}
              </span>
            {/if}
          </div>
        </Button>
      {/each}
    {/if}
  </div>
  <hr class="m-2" />
  <div
    class="m-3 flex flex-col {!isSidebarCollapsed
      ? 'mx-6 items-start'
      : 'items-center'}"
  >
    <div class="flex h-[44px] items-center">
      {#if sidebarState.showPlaceholder}
        <!-- Skeleton playlist header when loading-->
        {#if !isSidebarCollapsed}
          <!-- Full header with exact spacing matching real content structure -->
          <Skeleton class="my-1 h-9 w-9 flex-shrink-0 rounded-full" />
          <h2 class="ml-4 text-lg font-semibold tracking-tight opacity-50">
            Playlists
          </h2>
        {:else}
          <!-- Collapsed header - centered circle -->
          <Skeleton class="my-1 h-9 w-9 flex-shrink-0 rounded-full" />
        {/if}
      {:else}
        <!-- Real content with identical structure to skeleton -->
        {#if !session?.user.id}
          <Popover.Root>
            <Popover.Trigger
              class={buttonVariants({
                variant: 'secondary',
                size: 'icon',
                class: 'my-1 cursor-pointer rounded-full',
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
            class="my-1 cursor-pointer rounded-full"
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
      {/if}
    </div>
  </div>

  <div
    class="rounded-md border-2 transition-colors duration-150 {!isSidebarCollapsed
      ? 'mx-2'
      : 'mx-1'}
    {sidebarState.playlists.length > 0 &&
    contentState.dragContentType === 'video'
      ? 'border-secondary/80'
      : 'border-transparent'}"
  >
    <div class="flex flex-col">
      {#if sidebarState.showPlaceholder}
        <!-- Skeleton playlists when loading -->
        {#each Array(6), i}
          <SidebarItem
            isLoading={true}
            {isSidebarCollapsed}
            showSpecialIcon={true}
            iconIndex={i}
            class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 {!isSidebarCollapsed
              ? 'h-[56px] px-2 py-1'
              : 'h-[56px] w-10 justify-center px-1 py-1'}"
          />
        {/each}
      {:else if sidebarState.playlists === null}
        <Loader class="w-full animate-spin" />
      {:else if session && sidebarState.playlists.length > 0}
        <div class="flex flex-col">
          {#each sidebarState.playlists as playlist, i (playlist.id)}
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
                class={playlistState.getButtonClasses({
                  index: i,
                  isSelected: isPlaylistSelected(playlist),
                  itemType: 'playlist',
                  isSidebarCollapsed,
                  playlists: sidebarState.playlists,
                  selectedPlaylistIdParam:
                    currentSelection?.type === 'playlist'
                      ? currentSelection.value
                      : undefined,
                  session,
                })}
                size={!isSidebarCollapsed ? 'default' : 'icon'}
                onclick={() => {
                  handlePlaylistClick(playlist);
                }}
                title={playlist.name}
                value={playlist.name}
                onmouseenter={() => playlistState.handleMouseEnter(i)}
                onmouseleave={() => playlistState.handleMouseLeave(i)}
                ondragstart={(e) => dragDropHandlers.handleDragStart(e, i)}
                ondragover={(e) => dragDropHandlers.handleDragOver(e, i)}
                ondragleave={(e) => dragDropHandlers.handleDragLeave(e, i)}
                ondrop={(e) => dragDropHandlers.handleDrop(e, i)}
                ondragend={dragDropHandlers.handleDragEnd}
              >
                <div
                  class="absolute flex grow items-center
                    {!isSidebarCollapsed ? 'w-full grow' : 'item-center'}"
                >
                  {#if playlist.processedImageUrl}
                    <div class="h-12 w-12 shrink-0">
                      <img
                        src={playlist.processedImageUrl}
                        class="h-full w-full cursor-pointer rounded object-cover"
                        alt={`Image for playlist: ${playlist.name}`}
                        loading="lazy"
                      />
                    </div>
                  {:else}
                    <div
                      class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded"
                    >
                      <ListVideo class="!h-8 !w-8" />
                    </div>
                  {/if}
                  {#if !isSidebarCollapsed}
                    <span
                      class="mr-6 max-h-10 justify-start overflow-hidden px-3 text-left text-sm text-wrap"
                    >
                      {playlist.name}
                    </span>
                  {/if}
                </div>
              </Button>
            </PlaylistContextMenu>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</aside>
