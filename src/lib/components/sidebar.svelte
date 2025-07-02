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
  import { createDragImage } from "$lib/utils/dragdrop";
  import { pageState } from "$lib/state/page.svelte";

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
  let hoveredPlaylistIndex = $state<number | null>(null);

  // Native drag and drop state
  let draggedIndex = $state<number | null>(null);
  let targetIndex = $state<number | null>(null);

  const endDropzoneClasses = ["border-transparent"];
  const videoDropzoneClasses = [
    "border-solid",
    "border-primary",
    "bg-primary/20",
  ];

  function handleMouseEnter(index: number) {
    // Only allow hover if not scrolling and not dragging
    if (!pageState.sidebarScrollState.scrolling && draggedIndex === null) {
      hoveredPlaylistIndex = index;
    }
  }

  function handleMouseLeave(index: number) {
    if (hoveredPlaylistIndex === index) {
      hoveredPlaylistIndex = null;
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

  function getPlaylistDragClasses(index: number) {
    let classes = "relative";

    if (draggedIndex === index) {
      classes += " opacity-60";
    }

    if (targetIndex === index) {
      if (draggedIndex === null || draggedIndex < targetIndex) {
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

  function getButtonClasses(
    index: number,
    isSelected: boolean,
    itemType: "source" | "playlist" = "playlist",
  ) {
    let classes = "sidebar-full-button";

    // Add drag classes for playlists only
    if (itemType === "playlist") {
      classes += ` ${getPlaylistDragClasses(index)}`;
    }

    // Manual hover effect (only when appropriate)
    if (
      hoveredPlaylistIndex === index &&
      !pageState.sidebarScrollState.scrolling &&
      draggedIndex === null
    ) {
      if (isSelected) {
        classes += " !hover:bg-secondary brightness-125";
      } else {
        classes += " hover:bg-secondary/25";
      }
    }

    // Selected styling
    if (isSelected) {
      if (itemType === "source") {
        classes += " bg-secondary";
      } else {
        classes += " bg-secondary/65";
      }
    }

    // Sidebar layout classes
    if (!isSidebarCollapsed) {
      classes += " min-w-[150px] justify-normal";
    } else {
      classes += " align-middle";
    }

    // Video drag styling (playlists only)
    if (
      itemType === "playlist" &&
      contentState.dragContentType === "video" &&
      (playlists[index]?.created_by !== session?.user.id ||
        playlists[index].short_id === selectedPlaylistIdParam)
    ) {
      classes += " opacity-50 border-transparent";
    }

    return classes;
  }

  // Native drag and drop handlers
  function handleDragStart(e: DragEvent, index: number) {
    draggedIndex = index;
    contentState.dragContentType = "playlist";

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }

    hoveredPlaylistIndex = null;
    createDragImage(e, playlists[index].name);
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();

    // Handle video drop zones
    if (contentState.dragContentType === "video") {
      const playlist = playlists[index];
      if (e.currentTarget instanceof HTMLElement) {
        const classes = getDropzoneClasses(playlist);
        e.currentTarget.classList.add(...classes);
        e.currentTarget.classList.remove(...endDropzoneClasses);
      }
    }

    // Handle playlist reordering
    if (
      draggedIndex !== null &&
      draggedIndex !== index &&
      targetIndex !== index
    ) {
      targetIndex = index;
    }
  }

  function handleDragEnd() {
    draggedIndex = null;
    targetIndex = null;
    hoveredPlaylistIndex = null;
  }

  function handleDragLeave(e: DragEvent, index: number) {
    const relatedTarget = e.relatedTarget as Node;
    if (
      e.currentTarget instanceof HTMLElement &&
      !e.currentTarget.contains(relatedTarget)
    ) {
      // Clear target index for playlist reordering
      if (contentState.dragContentType === "playlist") {
        targetIndex = null;
      }

      // Handle video drop zone styling
      if (contentState.dragContentType === "video") {
        const playlist = playlists[index];
        const classes = getDropzoneClasses(playlist);
        e.currentTarget.classList.remove(...classes);
        e.currentTarget.classList.add(...endDropzoneClasses);
      }
    }
  }

  async function handleDrop(e: DragEvent, playlistTargetIndex: number) {
    if (!session) {
      return;
    }

    if (e.currentTarget instanceof HTMLElement) {
      const classes = getDropzoneClasses(playlists[playlistTargetIndex]);
      e.currentTarget.classList.remove(...classes);

      e.currentTarget.classList.add(...endDropzoneClasses);
    }

    if (contentState.dragContentType === "video") {
      handleAddVideosToPlaylist({
        playlist: playlists[playlistTargetIndex],
        videos: contentState.selectedVideos,
        playlistImages: contentState.playlistImages,
        supabase,
        session,
      });
    } else if (contentState.dragContentType === "playlist") {
      if (draggedIndex === null || draggedIndex < 0) {
        return;
      }
      handleUpdatePlaylistPosition({
        playlist: playlists[draggedIndex],
        position: playlists.length - playlistTargetIndex,
        supabase,
        session,
      });

      const updatedPlaylists = [...playlists];
      const [movedItem] = updatedPlaylists.splice(draggedIndex, 1);
      updatedPlaylists.splice(playlistTargetIndex, 0, movedItem);
      playlists = updatedPlaylists;
    }
  }

  function handlePlaylistClick(playlist: Playlist) {
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
  }
</script>

<aside class="h-full overflow-hidden">
  <div class="flex flex-col {!isSidebarCollapsed ? 'mx-2' : 'mx-1'}">
    {#each SOURCES as source, i (source)}
      <Button
        variant="ghost"
        class={getButtonClasses(i, selectedSource === source, "source")}
        size={!isSidebarCollapsed ? "default" : "icon"}
        onclick={() => goto(`/${source}`)}
        title={SOURCE_INFO[source].displayName}
        onmouseenter={() => handleMouseEnter(i)}
        onmouseleave={() => handleMouseLeave(i)}
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
      {#if playlists === null || !playlistImagesLoaded}
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
                class={getButtonClasses(i, isSelectedPlaylist, "playlist")}
                size={!isSidebarCollapsed ? "default" : "icon"}
                onclick={() => handlePlaylistClick(playlist)}
                title={playlist.name}
                value={playlist.name}
                onmouseenter={() => handleMouseEnter(i)}
                onmouseleave={() => handleMouseLeave(i)}
                ondragstart={(e) => handleDragStart(e, i)}
                ondragover={(e) => handleDragOver(e, i)}
                ondragleave={(e) => handleDragLeave(e, i)}
                ondrop={(e) => handleDrop(e, i)}
                ondragend={handleDragEnd}
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
                      class="text-sm mr-6 overflow-none px-3 text-clip justify-start whitespace-nowrap break-keep"
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
