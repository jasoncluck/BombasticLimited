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
  import { onMount } from "svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import { page } from "$app/state";
  import PlaylistContextMenu from "./playlist/playlist-context-menu.svelte";
  import { createDragImage } from "$lib/utils/dragdrop";
  import { pageState } from "$lib/state/page.svelte";

  const endDropzoneClasses = ["border-transparent"];

  const videoDropzoneClasses = [
    "border-solid",
    "border-primary",
    "bg-primary/10",
  ];

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
  let playlistImagesLoaded = $state(false);

  let draggedIndex = $state<number | null>(null);
  let targetIndex = $state<number | null>(null);
  let hoveredIndex = $state<number | null>(null);

  function handleMouseEnter(index: number) {
    // Only allow hover if not scrolling and not dragging
    if (!pageState.sidebarScrollState.scrolling && draggedIndex === null) {
      hoveredIndex = index;
    }
  }

  function handleMouseLeave(index: number) {
    if (hoveredIndex === index) {
      hoveredIndex = null;
    }
  }

  onMount(() => {
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

  function getDropzoneClasses() {
    if (contentState.dragContentType === "video") {
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
      if (!draggedIndex || draggedIndex < targetIndex) {
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

  function getButtonClasses(index: number, isSelectedPlaylist: boolean) {
    let classes =
      "h-[64px] w-full border border-transparent relative cursor-pointer transition-colors duration-0";

    // Add drag classes
    classes += ` ${getPlaylistDragClasses(index)}`;

    // Manual hover effect (only when appropriate)
    if (
      hoveredIndex === index &&
      !pageState.sidebarScrollState.scrolling &&
      draggedIndex === null
    ) {
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

  function handleDragStart(
    e:
      | (DragEvent & { currentTarget: EventTarget & HTMLButtonElement })
      | (DragEvent & { currentTarget: EventTarget & HTMLAnchorElement }),
    index: number,
  ) {
    draggedIndex = index;
    contentState.dragContentType = "playlist";

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }

    hoveredIndex = null;
    createDragImage(e, playlists[index].name);
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.currentTarget instanceof HTMLElement) {
      if (contentState.dragContentType === "video") {
        const classes = getDropzoneClasses();
        e.currentTarget.classList.add(...classes);
        e.currentTarget.classList.remove(...endDropzoneClasses);
      }
    }

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
    hoveredIndex = null;
  }

  function handleDragLeave(
    e:
      | (DragEvent & { currentTarget: EventTarget & HTMLButtonElement })
      | (DragEvent & { currentTarget: EventTarget & HTMLAnchorElement }),
  ) {
    const relatedTarget = e.relatedTarget as Node;
    if (!e.currentTarget.contains(relatedTarget)) {
      targetIndex = null;
      const classes = getDropzoneClasses();
      e.currentTarget.classList.remove(...classes);
      e.currentTarget.classList.add(...endDropzoneClasses);
    }

    // Only add bg-transparent if not a selected playlist
    // e.currentTarget.classList.add("bg-transparent");
    // e.currentTarget.classList.add("border-transparent");
  }

  async function handlePlaylistDrop(e: DragEvent, playlistTargetIndex: number) {
    if (!session) {
      return;
    }

    if (e.currentTarget instanceof HTMLElement) {
      const classes = getDropzoneClasses();
      e.currentTarget.classList.remove(...classes);

      e.currentTarget.classList.add(...endDropzoneClasses);
    }

    if (contentState.dragContentType === "video") {
      handleAddVideosToPlaylist({
        playlist: playlists[playlistTargetIndex],
        videos: contentState.selectedVideos,
        contentState,
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
</script>

<nav class="h-full">
  <div class="flex flex-col gap-2 mx-2 my-3">
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
    class="flex flex-col gap-2 px-4 mt-3 mb-3
    min-w-[4px] mx-2
    {!isSidebarCollapsed ? 'items-start' : 'items-center'}"
  >
    <div class="flex items-center h-[44px]">
      {#if !session?.user.id}
        <Popover.Root>
          <Popover.Trigger
            class={buttonVariants({
              variant: "secondary",
              size: "icon",
              class: "my-1 rounded-full",
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
    class="flex flex-col m-2 border-1 overflow-auto
    {contentState.dragContentType === 'video'
      ? 'border-secondary border-1 '
      : 'border-transparent'}"
  >
    {#if playlists === null || !playlistImagesLoaded}
      <Loader class="animate-spin mr-2 w-full" />
    {:else}
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
            class={getButtonClasses(i, isSelectedPlaylist)}
            size={!isSidebarCollapsed ? "default" : "icon"}
            onclick={() => goto(`/playlist/${encodeURI(playlist.short_id)}`)}
            title={playlist.name}
            value={playlist.name}
            onmouseenter={() => handleMouseEnter(i)}
            onmouseleave={() => handleMouseLeave(i)}
            ondragstart={(e) => handleDragStart(e, i)}
            ondragover={(e) => {
              handleDragOver(e, i);
            }}
            ondragleave={(e) => {
              handleDragLeave(e);
            }}
            ondrop={(e) => {
              handlePlaylistDrop(e, i);
            }}
            ondragend={handleDragEnd}
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
        </PlaylistContextMenu>
      {/each}
    {/if}
  </div>
</nav>
