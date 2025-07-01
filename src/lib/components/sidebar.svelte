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

  const endDropzoneClasses = ["border-transparent"];
  const videoDropzoneClasses = [
    "border-solid",
    "border-primary",
    "bg-primary/20",
  ];

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

  function getDropzoneClasses(playlist: Playlist) {
    if (
      contentState.dragContentType === "video" &&
      playlist.created_by === session?.user.id
    ) {
      return videoDropzoneClasses;
    }
    return [];
  }

  function handleDndConsider(e: CustomEvent<DndEvent>) {
    // Update playlists during drag for visual feedback
    const updatedItems = e.detail.items as typeof dndPlaylists;
    dndPlaylists = [...updatedItems];
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent>) {
    if (!session) return;

    const updatedItems = e.detail.items as typeof dndPlaylists;

    // Check if the order actually changed by comparing IDs
    const originalOrder = playlists.map((p) => p.id);
    const newOrder = updatedItems.map((item) => item.id);

    const orderChanged = !originalOrder.every(
      (id, index) => id === newOrder[index],
    );

    if (!orderChanged) {
      // No change, just update dndPlaylists to match current playlists
      dndPlaylists = playlists.map((playlist, index) => ({
        ...playlist,
        id: playlist.id || index,
      }));
      return;
    }

    // Find the item that moved the MOST positions (this is the dragged item)
    let movedPlaylistId: string | number | null = null;
    let maxPositionChange = 0;
    let newIndex = -1;

    originalOrder.forEach((id, origIndex) => {
      const newPos = newOrder.indexOf(id);
      const positionChange = Math.abs(origIndex - newPos);

      if (positionChange > maxPositionChange) {
        maxPositionChange = positionChange;
        movedPlaylistId = id;
        newIndex = newPos;
      }
    });

    if (movedPlaylistId && maxPositionChange > 0) {
      const movedPlaylist = playlists.find((p) => p.id === movedPlaylistId);

      if (movedPlaylist) {
        // Calculate the new position based on the target index
        // Your system appears to use higher numbers for items at the top
        const newPosition = playlists.length - newIndex;

        try {
          await handleUpdatePlaylistPosition({
            playlist: movedPlaylist,
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
    }

    // Update the final playlists state to match the new order
    const reorderedPlaylists = updatedItems.map((item, newIndex) => {
      const originalPlaylist = playlists.find((p) => p.id === item.id)!;
      return {
        ...originalPlaylist,
        // Update the playlist_position to match the new order
        playlist_position: playlists.length - newIndex,
      };
    });

    playlists = reorderedPlaylists;
  }

  // Video drag and drop handlers
  function handleVideoDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    const playlist = playlists[index];
    if (contentState.dragContentType === "video") {
      if (e.currentTarget instanceof HTMLElement) {
        const classes = getDropzoneClasses(playlist);
        e.currentTarget.classList.add(...classes);
        e.currentTarget.classList.remove(...endDropzoneClasses);
      }
    }
  }

  function handleVideoDragLeave(e: DragEvent, index: number) {
    const relatedTarget = e.relatedTarget as Node;
    if (
      e.currentTarget instanceof HTMLElement &&
      !e.currentTarget.contains(relatedTarget)
    ) {
      const playlist = playlists[index];
      const classes = getDropzoneClasses(playlist);
      e.currentTarget.classList.remove(...classes);
      e.currentTarget.classList.add(...endDropzoneClasses);
    }
  }

  function handleVideoDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (!session || contentState.dragContentType !== "video") return;

    const playlist = playlists[index];

    if (playlist.created_by !== session.user.id) {
      return;
    }

    if (e.currentTarget instanceof HTMLElement) {
      const classes = getDropzoneClasses(playlist);
      e.currentTarget.classList.remove(...classes);
      e.currentTarget.classList.add(...endDropzoneClasses);
    }

    handleAddVideosToPlaylist({
      playlist,
      videos: contentState.selectedVideos,
      playlistImages: contentState.playlistImages,
      supabase,
      session,
    });
  }

  function handlePlaylistClick(playlist: Playlist) {
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
  }
</script>

<aside class="h-full overflow-hidden">
  <div class="flex flex-col my-3 mx-2">
    {#each SOURCES as source (source)}
      <Button
        variant="ghost"
        class="h-[64px] w-full cursor-pointer  transition-colors duration-100 
        {selectedSource === source ? 'bg-secondary' : 'hover:bg-secondary/50'}  
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

  <!-- Fixed: Border is always present but transparent when not dragging -->
  <div
    class="border-2 rounded-md mx-1 transition-colors duration-150
    {playlists.length > 0 && contentState.dragContentType === 'video'
      ? 'border-secondary/80'
      : 'border-transparent'}"
  >
    <div class="flex flex-col">
      {#if playlists === null || !playlistImagesLoaded}
        <Loader class="animate-spin w-full" />
      {:else if session && dndPlaylists.length > 0}
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
          class="flex flex-col w-full"
        >
          {#each dndPlaylists as playlist, i (playlist.id)}
            <div animate:flip={{ duration: flipDurationMs }} class="w-full">
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
                  class="h-[64px] w-full border border-transparent relative cursor-pointer transition-all  duration-200
                  {hoveredIndex === i && !pageState.sidebarScrollState.scrolling
                    ? 'hover:bg-secondary'
                    : 'hover:bg-transparent'}
                  {isSelectedPlaylist
                    ? 'bg-secondary'
                    : 'hover:bg-secondary/50'}  
                  {!isSidebarCollapsed
                    ? 'min-w-[150px] justify-normal'
                    : 'align-middle'}

                  {contentState.dragContentType === 'video' &&
                    playlist.created_by !== session.user.id &&
                    'opacity-50'}
                  "
                  size={!isSidebarCollapsed ? "default" : "icon"}
                  onclick={() => handlePlaylistClick(playlist)}
                  title={playlist.name}
                  value={playlist.name}
                  onmouseenter={() => handleMouseEnter(i)}
                  onmouseleave={() => handleMouseLeave(i)}
                  ondragover={(e) => handleVideoDragOver(e, i)}
                  ondragleave={(e) => handleVideoDragLeave(e, i)}
                  ondrop={(e) => handleVideoDrop(e, i)}
                >
                  <div
                    class="flex items-center grow absolute
                    {!isSidebarCollapsed ? 'grow w-full' : 'item-center'}"
                  >
                    {#if contentState.playlistImages[playlist.id]}
                      <div class="h-12 w-12 flex-shrink-0">
                        <img
                          src={contentState.playlistImages[playlist.id]}
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
                        class="text-sm mr-6 overflow-hidden px-3 text-clip justify-start whitespace-nowrap break-keep"
                      >
                        {playlist.name}
                      </span>
                    {/if}
                  </div>
                </Button>
              </PlaylistContextMenu>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</aside>
