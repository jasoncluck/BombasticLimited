<script lang="ts">
  import { ListVideo, Plus } from '@lucide/svelte';
  import { type SupabaseClient, type Session } from '@supabase/supabase-js';
  import { SOURCE_INFO, SOURCES } from '$lib/constants/source';
  import * as Popover from '$lib/components/ui/popover';
  import { invalidate } from '$app/navigation';
  import { getContentState } from '$lib/state/content.svelte';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { page } from '$app/state';
  import { updateProfileSources } from '$lib/supabase/user-profiles';
  import { showToast } from '$lib/state/notifications.svelte';
  import { getSourceState } from '$lib/state/source.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { handleCreatePlaylist } from '../playlist/playlist-service';
  import Button, { buttonVariants } from '../ui/button/button.svelte';
  import PlaylistContextMenu from '../playlist/playlist-context-menu.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import StreamingIndicator from '../streaming/streaming-indicator.svelte';
  import Loader from '../loader.svelte';

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
  const playlistDragDropHandlers = $derived(
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
    currentSelection = { type: 'source', value: source };
  }

  // Enhanced playlist selection with immediate feedback
  function handlePlaylistClick(playlist: Playlist) {
    // Update selection immediately - this deselects any source
    currentSelection = { type: 'playlist', value: playlist.short_id };
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
          });

          // Refresh sidebar to get updated profile
          await refreshSidebar?.();
          invalidate('supabase:db:profiles');
        } catch (error) {
          console.error('Failed to update source ordering:', error);
          showToast('An error occurred, unable to reorder.');

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

<aside class="h-full overflow-hidden pt-2">
  {#if sidebarState.showPlaceholder}
    <!-- Simple centered loader for entire sidebar -->
    <div class="flex h-full items-center justify-center">
      <Loader variant="block" size="md" message="" />
    </div>
  {:else}
    <!-- Real sidebar content -->
    <div class="flex flex-col {!isSidebarCollapsed ? 'mx-2' : 'mx-1'}">
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
          href={`/${source}`}
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
    </div>
    <hr class="m-2" />
    <div
      class="m-3 flex flex-col {!isSidebarCollapsed
        ? 'mx-6 items-start'
        : 'items-center'}"
    >
      <div class="flex h-[44px] items-center">
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
            <Popover.Content class="text-sm"
              >Create an account or login to use playlists.</Popover.Content
            >
          </Popover.Root>
        {:else}
          <Button
            variant="secondary"
            title="Create Playlist"
            data-testid="create-playlist-button"
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
      </div>
    </div>

    <div
      class="relative transition-colors duration-150 {!isSidebarCollapsed
        ? 'mx-2'
        : 'mx-1'}
  {sidebarState.playlists.length > 0 && contentState.dragContentType === 'video'
        ? 'before:border-secondary/80 before:pointer-events-none before:absolute before:inset-0 before:rounded-md before:border-2'
        : ''}"
    >
      <div class="flex flex-col">
        {#if sidebarState.playlists === null}
          <Loader variant="block" size="sm" message="" />
        {:else if session && sidebarState.playlists.length > 0}
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
                data-testid="playlist-button"
                data-playlist-id={playlist.short_id}
                class="{playlistState.getButtonClasses({
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
                })} relative z-0"
                size={!isSidebarCollapsed ? 'default' : 'icon'}
                onclick={() => {
                  handlePlaylistClick(playlist);
                }}
                href={`/playlist/${encodeURI(playlist.short_id)}`}
                title={playlist.name}
                value={playlist.name}
                onmouseenter={() => playlistState.handleMouseEnter(i)}
                onmouseleave={() => playlistState.handleMouseLeave(i)}
                ondragstart={(e) =>
                  playlistDragDropHandlers.handleDragStart(e, i)}
                ondragover={(e) =>
                  playlistDragDropHandlers.handleDragOver(e, i)}
                ondragleave={(e) =>
                  playlistDragDropHandlers.handleDragLeave(e, i)}
                ondrop={(e) => playlistDragDropHandlers.handleDrop(e, i)}
                ondragend={playlistDragDropHandlers.handleDragEnd}
              >
                <div
                  class="absolute flex grow items-center
                {!isSidebarCollapsed ? 'w-full grow' : 'item-center'}"
                >
                  {#if playlist.image_url}
                    <div class="h-12 w-12 shrink-0">
                      <img
                        src={playlist.image_url}
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
        {/if}
      </div>
    </div>
  {/if}
</aside>
