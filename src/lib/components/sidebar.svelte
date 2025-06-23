<script lang="ts">
  import { Circle, ListVideo, Loader, Plus } from "@lucide/svelte";
  import Button, { buttonVariants } from "./ui/button/button.svelte";
  import { type SupabaseClient, type Session } from "@supabase/supabase-js";
  import { type Playlist } from "$lib/supabase/playlists";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";
  import * as Popover from "$lib/components/ui/popover";
  import { activeStreams } from "$lib/state/streaming.svelte";
  import {
    getCroppedPlaylistImageUrl,
    handleAddVideosToPlaylist,
    handleCreatePlaylist,
    handleUpdatePlaylistPosition,
  } from "./playlist/playlist-service";
  import { goto } from "$app/navigation";
  import { getContentState } from "$lib/state/content.svelte";
  import { page } from "$app/state";
  import PlaylistContextMenu from "./playlist/playlist-context-menu.svelte";
  import { pageState } from "$lib/state/page.svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import type { DndEvent } from "svelte-dnd-action";

  let {
    playlists = $bindable(),
    supabase,
    session,
    isSidebarCollapsed,
  }: {
    playlists: Playlist[];
    supabase: SupabaseClient;
    session: Session | null;
    isSidebarCollapsed: boolean;
  } = $props();

  const selectedSource = $derived(page.params.source);
  const selectedPlaylistIdParam = $derived(page.params.shortId);

  const contentState = getContentState();
  let playlistImagesLoaded = $state(!session);
  let hoveredIndex = $state<number | null>(null);
  let dndPlaylists = $derived<(Playlist & { id: string | number })[]>([]);

  const flipDurationMs = 200;

  // Transform playlists to include proper id for dnd-action
  $effect(() => {
    dndPlaylists = playlists.map((playlist, index) => ({
      ...playlist,
      id: playlist.id || index,
    }));
  });

  function handleMouseEnter(index: number) {
    // Only allow hover if not scrolling and not dragging
    if (!pageState.sidebarScrollState.scrolling) {
      hoveredIndex = index;
    }
  }

  function handleMouseLeave(index: number) {
    if (hoveredIndex === index) {
      hoveredIndex = null;
    }
  }

  $effect(() => {
    if (!session) {
      playlistImagesLoaded = true;
      return;
    }
    const playlistImageUrls = playlists.map(async (p) => {
      const imageUrl = await getCroppedPlaylistImageUrl({
        imageProperties: p.image_properties,
        thumbnailMaxResUrl: p.thumbnail_maxres_url,
        thumbnailUrl: p.thumbnail_url,
      });
      return { id: p.id, imageUrl };
    });
    // Wait for all promises to resolve before updating the UI
    Promise.all(playlistImageUrls)
      .then((results) => {
        const imagesMap: Record<string, string | undefined> = {};
        results.forEach(({ id, imageUrl }) => {
          imagesMap[id] = imageUrl;
        });
        contentState.playlistImages = imagesMap;
        playlistImagesLoaded = true;
      })
      .catch((error) => {
        console.error("Error loading playlist images:", error);
        playlistImagesLoaded = true; // Still mark as loaded so UI can render with fallbacks
      });
  });

  function getButtonClasses(index: number, isSelectedPlaylist: boolean) {
    let classes =
      "h-[64px] w-full border border-transparent relative cursor-pointer transition-colors duration-200";

    // Manual hover effect (only when appropriate)
    if (hoveredIndex === index && !pageState.sidebarScrollState.scrolling) {
      classes += " hover:bg-secondary";
    } else if (!isSelectedPlaylist) {
      classes += " hover:bg-transparent ";
    }

    // Selected playlist styling
    if (isSelectedPlaylist) {
      classes += " bg-secondary";
    }

    // Sidebar layout classes
    if (!isSidebarCollapsed) {
      classes += " min-w-[150px] justify-normal";
    } else {
      classes += " align-middle";
    }

    return classes;
  }

  function handleDndConsider(e: CustomEvent<DndEvent>) {
    // Update playlists during drag for visual feedback
    const updatedItems = e.detail.items as typeof dndPlaylists;
    dndPlaylists = [...updatedItems];
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent>) {
    if (!session) return;

    const updatedItems = e.detail.items as typeof dndPlaylists;

    // Create a map to track position changes
    const originalPositions = new Map();
    playlists.forEach((playlist, index) => {
      originalPositions.set(playlist.id, { index, playlist });
    });

    // Find the moved playlist and calculate new positions
    const movedPlaylist = updatedItems.find((newItem, newIndex) => {
      const originalData = originalPositions.get(newItem.id);
      return originalData && originalData.index !== newIndex;
    });

    if (movedPlaylist) {
      const newIndex = updatedItems.findIndex(
        (item) => item.id === movedPlaylist.id,
      );
      const originalPlaylist = originalPositions.get(movedPlaylist.id).playlist;

      // Calculate the new position based on the target index
      // Your system appears to use higher numbers for items at the top
      const newPosition = playlists.length - newIndex;

      try {
        await handleUpdatePlaylistPosition({
          playlist: originalPlaylist,
          position: newPosition,
          supabase,
          session,
        });
      } catch (error) {
        console.error("Error updating playlist position:", error);
        // Revert to original order on error
        dndPlaylists = playlists.map((playlist, index) => ({
          ...playlist,
          id: playlist.id || index,
        }));
        return;
      }
    }

    // Update the final playlists state to match the new order
    const reorderedPlaylists = updatedItems.map((item, newIndex) => {
      const originalPlaylist = originalPositions.get(item.id).playlist;
      return {
        ...originalPlaylist,
        // Update the playlist_position to match the new order
        playlist_position: playlists.length - newIndex,
      };
    });

    playlists = reorderedPlaylists;
  }

  // Handle video drops on playlists
  function handleVideoDrop(e: CustomEvent, playlist: Playlist) {
    if (!session || contentState.dragContentType !== "video") return;

    handleAddVideosToPlaylist({
      playlist,
      videos: contentState.selectedVideos,
      contentState,
      supabase,
      session,
    });
  }

  function handlePlaylistClick(playlist: Playlist) {
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
  }
</script>

<aside class="h-full">
  <div class="flex flex-col my-3">
    {#each SOURCES as source (source)}
      <Button
        variant="ghost"
        class="h-[64px]  w-full cursor-pointer duration-0
        {selectedSource === source ? 'bg-secondary' : ''}  
        {!isSidebarCollapsed ? 'min-w-[150px] justify-normal' : 'align-middle'}"
        size={!isSidebarCollapsed ? "default" : "icon"}
        onclick={() => goto(`/${source}`)}
        title={SOURCE_INFO[source].displayName}
      >
        <div
          class="flex items-center relative {!isSidebarCollapsed
            ? 'items-start grow'
            : 'item-center'}"
        >
          {#if activeStreams.sources.includes(source)}
            <Circle
              class="absolute left-0 bottom-0"
              fill="#eb0400"
              strokeWidth={0}
            />
          {/if}
          <span class="sr-only">Live now</span>
          <div class="h-12 w-12">
            <img
              src={SOURCE_INFO[source].image}
              alt={SOURCE_INFO[source].displayName}
              class="h-full w-full"
            />
          </div>
          {#if !isSidebarCollapsed}
            <span class="text-sm font-medium m-3 overflow-ellipsis">
              {SOURCE_INFO[source].displayName}
            </span>
          {/if}
        </div>
      </Button>
    {/each}
  </div>
  <hr class="mx-2" />
  <div
    class="flex flex-col my-3 min-w-[4px]
    {!isSidebarCollapsed ? 'items-start ml-6' : 'items-center'}"
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
            handleCreatePlaylist({
              playlists,
              session,
              supabase,
            })}
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
    class="flex flex-col mr-1 border-1
    {playlists.length > 0 && contentState.dragContentType === 'video'
      ? 'border-secondary border-1 '
      : 'border-transparent'}"
  >
    {#if playlists === null || !playlistImagesLoaded}
      <Loader class="animate-spin  w-full" />
    {:else if session && dndPlaylists.length > 0}
      <!-- DnD Zone for Playlists -->
      <div
        use:dndzone={{
          items: dndPlaylists,
          flipDurationMs,
          type: "playlist",
          dropTargetStyle: {
            outline: "rgba(99, 102, 241, 0.5) solid 2px",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
          },
        }}
        onconsider={handleDndConsider}
        onfinalize={handleDndFinalize}
        class="flex flex-col"
      >
        {#each dndPlaylists as playlist, i (playlist.id)}
          <div animate:flip={{ duration: flipDurationMs }}>
            <PlaylistContextMenu
              {playlist}
              {selectedPlaylistIdParam}
              {isSidebarCollapsed}
              {supabase}
              {session}
            >
              {@const isSelectedPlaylist =
                selectedPlaylistIdParam === playlist.short_id}
              <!-- Video Drop Zone Wrapper -->
              <div
                use:dndzone={{
                  items: [],
                  type: "video-to-playlist",
                  dropFromOthersDisabled: false,
                  dragDisabled: true,
                  dropTargetStyle:
                    contentState.dragContentType === "video"
                      ? {
                          border: "2px solid rgb(99, 102, 241)",
                          backgroundColor: "rgba(99, 102, 241, 0.1)",
                        }
                      : {},
                }}
                onfinalize={(e) => handleVideoDrop(e, playlist)}
              >
                <Button
                  variant="ghost"
                  class={getButtonClasses(i, isSelectedPlaylist)}
                  size={!isSidebarCollapsed ? "default" : "icon"}
                  onclick={() => handlePlaylistClick(playlist)}
                  title={playlist.name}
                  value={playlist.name}
                  onmouseenter={() => handleMouseEnter(i)}
                  onmouseleave={() => handleMouseLeave(i)}
                >
                  <div
                    class="flex items-center grow absolute
                    {!isSidebarCollapsed ? 'items-start grow' : 'item-center'}"
                  >
                    {#if contentState.playlistImages[playlist.id]}
                      <div class="w-12 h-12">
                        <img
                          src={contentState.playlistImages[playlist.id]}
                          class="h-full w-full cursor-pointer"
                          alt={`Image for playlist: ${playlist.name}`}
                        />
                      </div>
                    {:else}
                      <div class="h-12 w-12 flex items-center justify-center">
                        <ListVideo class="!h-8 !w-8" />
                      </div>
                    {/if}
                    {#if !isSidebarCollapsed}
                      <span
                        class="text-sm font-medium m-3 max-w-[100px] overflow-ellipsis"
                      >
                        {playlist.name}
                      </span>
                    {/if}
                  </div>
                </Button>
              </div>
            </PlaylistContextMenu>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</aside>
