<script lang="ts">
  import { Circle, ListVideo, Loader, Plus } from "@lucide/svelte";
  import Button, { buttonVariants } from "./ui/button/button.svelte";
  import { type SupabaseClient, type Session } from "@supabase/supabase-js";
  import { type Playlist } from "$lib/supabase/playlists";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";
  import * as Popover from "$lib/components/ui/popover";
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { handleCreatePlaylist } from "./playlist/playlist-service";
  import { goto, invalidate } from "$app/navigation";
  import { getContentState } from "$lib/state/content.svelte";
  import { getPlaylistState } from "$lib/state/playlist.svelte";
  import { page } from "$app/state";
  import PlaylistContextMenu from "./playlist/playlist-context-menu.svelte";
  import { updateProfileSources, type Profile } from "$lib/supabase/profiles";
  import { showNotification } from "$lib/stores/notification";

  let {
    playlists = $bindable(),
    supabase,
    session,
    userProfile,
    isSidebarCollapsed,
  }: {
    playlists: Playlist[];
    supabase: SupabaseClient;
    userProfile: Profile | null;
    session: Session | null;
    isSidebarCollapsed: boolean;
  } = $props();

  const selectedSource = $derived(page.params.source);
  const selectedPlaylistIdParam = $derived(page.params.shortId);

  const contentState = getContentState();
  const playlistState = getPlaylistState();

  // Local state for sources ordering
  let orderedSources = $state(userProfile?.sources ?? [...SOURCES]);

  // Source drag and drop state
  let draggedSourceIndex = $state<number | null>(null);
  let targetSourceIndex = $state<number | null>(null);

  // Create drag and drop handlers for playlists
  const dragDropHandlers = $derived(
    playlistState.createPlaylistDragDrop({
      playlists,
      supabase,
      session,
      onPlaylistsUpdate: (updatedPlaylists) => {
        playlists = updatedPlaylists;
      },
    }),
  );

  // Source drag and drop handlers
  function handleSourceDragStart(event: DragEvent, index: number) {
    draggedSourceIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function handleSourceDragOver(event: DragEvent, index: number) {
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
    const relatedTarget = event.relatedTarget as Node;
    if (
      event.currentTarget instanceof HTMLElement &&
      !event.currentTarget.contains(relatedTarget)
    ) {
      targetSourceIndex = null;
    }
  }

  async function handleSourceDrop(event: DragEvent, dropIndex: number) {
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
    draggedSourceIndex = null;
    targetSourceIndex = null;
  }

  // Helper function to get source drag classes
  function getSourceDragClasses(index: number): string {
    let classes = "relative";

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
      <Button
        variant="ghost"
        draggable={true}
        class="{playlistState.getButtonClasses({
          index: i,
          isSelected: selectedSource === source,
          itemType: 'source',
          isSidebarCollapsed,
        })} {getSourceDragClasses(i)}"
        size={!isSidebarCollapsed ? "default" : "icon"}
        onclick={() => goto(`/${source}`)}
        title={SOURCE_INFO[source].displayName}
        onmouseenter={() => playlistState.handleMouseEnter(i)}
        onmouseleave={() => playlistState.handleMouseLeave(i)}
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
          onclick={async () => {
            const { playlist } = await handleCreatePlaylist({
              playlists,
              session,
              supabase,
            });

            if (playlist) {
              goto(`/playlist/${encodeURI(playlist.short_id)}`);
            }
          }}
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
    {playlists.length > 0 && contentState.dragContentType === 'video'
      ? 'border-secondary/80'
      : 'border-transparent'}"
  >
    <div class="flex flex-col">
      {#if playlists === null}
        <Loader class="animate-spin w-full" />
      {:else if session && playlists.length > 0}
        <div class="flex flex-col">
          {#each playlists as playlist, i (playlist.id)}
            <PlaylistContextMenu
              {playlist}
              {selectedPlaylistIdParam}
              {isSidebarCollapsed}
              {supabase}
              {session}
            >
              {@const isSelectedPlaylist =
                selectedPlaylistIdParam === playlist.short_id}

              <Button
                variant="ghost"
                draggable={true}
                class={playlistState.getButtonClasses({
                  index: i,
                  isSelected: isSelectedPlaylist,
                  itemType: "playlist",
                  isSidebarCollapsed,
                  playlists,
                  selectedPlaylistIdParam,
                  session,
                })}
                size={!isSidebarCollapsed ? "default" : "icon"}
                onclick={() => playlistState.handlePlaylistClick(playlist)}
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
              </Button>
            </PlaylistContextMenu>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</aside>
