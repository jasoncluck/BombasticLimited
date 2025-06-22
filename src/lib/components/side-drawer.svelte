<script lang="ts">
  import { goto } from "$app/navigation";
  import { SOURCES, SOURCE_INFO } from "$lib/constants/source";
  import { activeStreams } from "$lib/state/streaming.svelte";
  import {
    Circle,
    House,
    ListVideo,
    LogIn,
    LogOut,
    Menu,
    Plus,
    Settings,
  } from "@lucide/svelte";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import { Button } from "$lib/components/ui/button";
  import {
    handleCreatePlaylist,
    handleDeletePlaylist,
    handleUpdatePlaylistPosition,
  } from "./playlist/playlist-service";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { fade } from "svelte/transition";
  import type { Playlist } from "$lib/supabase/playlists";
  import { getContentState } from "$lib/state/content.svelte";
  import ScrollArea from "./ui/scroll-area/scroll-area.svelte";
  import { pageState } from "$lib/state/page.svelte";
  import { createDragImage } from "$lib/utils/dragdrop";
  import { page } from "$app/state";

  let {
    playlists,
    handleLogout,
    session,
    supabase,
  }: {
    playlists: Playlist[];
    handleLogout: () => void;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();
  let isOpen = $state(false);

  const selectedPlaylistIdParam = $derived(page.params.shortId);
  const contentState = getContentState();

  let draggedIndex = $state<number | null>(null);
  let targetIndex = $state<number | null>(null);
  let hoveredIndex = $state<number | null>(null);

  let touchStartY = $state<number | null>(null);
  let touchStartTime = $state<number | null>(null);
  let isDragging = $state(false);
  let touchMoved = $state(false);

  const endDropzoneClasses = ["border-transparent"];

  function handleMouseEnter(index: number) {
    // Only allow hover if not scrolling and not dragging
    if (!pageState.drawerScrollState.scrolling && draggedIndex === null) {
      hoveredIndex = index;
    }
  }

  function handleMouseLeave(index: number) {
    if (hoveredIndex === index) {
      hoveredIndex = null;
    }
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
    isDragging = false;
    touchMoved = false;
  }

  function handleDragLeave(
    e:
      | (DragEvent & { currentTarget: EventTarget & HTMLButtonElement })
      | (DragEvent & { currentTarget: EventTarget & HTMLAnchorElement }),
  ) {
    const relatedTarget = e.relatedTarget as Node;
    if (!e.currentTarget.contains(relatedTarget)) {
      targetIndex = null;
      e.currentTarget.classList.add(...endDropzoneClasses);
    }
  }

  // Touch event handlers
  function handleTouchStart(e: TouchEvent, index: number) {
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    touchMoved = false;

    // Start drag after a short delay to distinguish from scrolling
    setTimeout(() => {
      if (
        touchStartY !== null &&
        !touchMoved &&
        Date.now() - (touchStartTime || 0) >= 50
      ) {
        isDragging = true;
        draggedIndex = index;
        contentState.dragContentType = "playlist";
        hoveredIndex = null;
      }
    }, 150);
  }

  function handleTouchMove(e: TouchEvent, index: number) {
    if (!touchStartY) return;

    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - touchStartY);

    // If user moved significantly, they're probably scrolling or dragging
    if (deltaY > 10) {
      touchMoved = true;

      if (!isDragging) return;
    }

    if (isDragging && draggedIndex !== null) {
      // Find the element under the touch point
      const elementBelow = document.elementFromPoint(
        touch.clientX,
        touch.clientY,
      );
      const buttonElement = elementBelow?.closest("[data-playlist-index]");

      if (buttonElement) {
        const targetIdx = parseInt(
          buttonElement.getAttribute("data-playlist-index") || "-1",
        );
        if (
          targetIdx !== -1 &&
          targetIdx !== draggedIndex &&
          targetIndex !== targetIdx
        ) {
          targetIndex = targetIdx;
        }
      }
    }
  }

  function handleTouchEnd(e: TouchEvent, index: number) {
    if (isDragging && draggedIndex !== null && targetIndex !== null) {
      // Perform the drop
      handlePlaylistDrop(e as any, targetIndex);
    } else if (!touchMoved && !isDragging) {
      // This was a tap, navigate to the playlist
      goto(`/playlist/${encodeURI(playlists[index].short_id)}`);
      isOpen = false;
    }

    // Reset touch state
    touchStartY = null;
    touchStartTime = null;
    isDragging = false;
    touchMoved = false;
    handleDragEnd();
  }

  async function handlePlaylistDrop(
    e: DragEvent | TouchEvent,
    playlistTargetIndex: number,
  ) {
    if (!session) {
      return;
    }

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add(...endDropzoneClasses);
    }

    if (contentState.dragContentType === "playlist") {
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

<Sheet.Root bind:open={isOpen}>
  <Sheet.Trigger><Menu class="cursor-pointer" /></Sheet.Trigger>
  <Sheet.Content
    side="left"
    class="flex flex-col gap-2 mx-2 pt-12 min-w-[300px]"
  >
    <ScrollArea>
      {#if isOpen}
        <div transition:fade>
          <Button
            variant="ghost"
            class="cursor-pointer w-full flex justify-start h-[64px]"
            onclick={() => {
              goto(`/`);
              isOpen = false;
            }}
          >
            <div class="flex items-center w-12 h-12">
              <House class="!w-8 !h-8 mx-2 " />
            </div>
            <span class="text-sm font-medium m-3 overflow-ellipsis">
              Home
            </span>
          </Button>

          {#each SOURCES as source (source)}
            <Button
              variant="ghost"
              class="cursor-pointer w-full flex justify-start h-[64px] relative"
              onclick={() => {
                goto(`/${source}`);
                isOpen = false;
              }}
              title={SOURCE_INFO[source].displayName}
            >
              {#if activeStreams.sources.includes(source)}
                <Circle
                  class="absolute left-2 bottom-2"
                  fill="#eb0400"
                  strokeWidth={0}
                />
              {/if}
              <span class="sr-only">Live now</span>
              <img
                src={SOURCE_INFO[source].image}
                alt={SOURCE_INFO[source].displayName}
                class="w-12 h-12"
              />
              <span class="text-sm font-medium m-3 overflow-ellipsis">
                {SOURCE_INFO[source].displayName}
              </span>
            </Button>
          {/each}
          <Sheet.Title class="mx-4 mt-4 mb-2">Playlists</Sheet.Title>
          {#if session}
            <Button
              variant="ghost"
              class="cursor-pointer w-full flex justify-start h-[64px]"
              onclick={() => {
                handleCreatePlaylist({
                  playlists,
                  session,
                  supabase,
                });
                isOpen = false;
              }}
            >
              <div class="flex items-center w-12 h-12">
                <Plus class="flex !w-8 !h-8 mx-2" />
              </div>
              <span class="text-sm font-medium m-3 overflow-ellipsis">
                Add Playlist
              </span>
            </Button>
          {:else}
            <Sheet.Description>
              <p class="text-sm font-medium m-3 overflow-ellipsis">
                Create an account or login to use Playlists
              </p>
            </Sheet.Description>
          {/if}
          {#each playlists as playlist, i (playlist.id)}
            {@const isSelectedPlaylist =
              selectedPlaylistIdParam === playlist.short_id}
            <Button
              variant="ghost"
              class="{getButtonClasses(
                i,
                isSelectedPlaylist,
              )} cursor-pointer w-full flex justify-start h-[64px]"
              draggable={true}
              data-playlist-index={i}
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
              ontouchstart={(e) => handleTouchStart(e, i)}
              ontouchmove={(e) => handleTouchMove(e, i)}
              ontouchend={(e) => handleTouchEnd(e, i)}
              onclick={async (e) => {
                // Prevent navigation if we just finished a drag
                if (isDragging || touchMoved) {
                  e.preventDefault();
                  return;
                }
                goto(`/playlist/${encodeURI(playlist.short_id)}`);
                isOpen = false;
              }}
              title={playlist.name}
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
                <div class="h-12 min-w-12 flex items-center justify-center">
                  <ListVideo class="!h-8 !w-8" />
                </div>
              {/if}

              <span class="text-sm font-medium m-3 max-w-[100px]">
                {playlist.name}
              </span>
            </Button>
          {/each}

          <Sheet.Title class="mx-4 mt-4 mb-2">Account</Sheet.Title>
          {#if session}
            <Button
              variant="ghost"
              class="cursor-pointer w-full flex justify-start h-[64px]"
              onclick={() => {
                goto(`/account`);
                isOpen = false;
              }}
            >
              <div class="flex items-center w-12 h-12">
                <Settings class="flex !w-8 !h-8 mx-2" />
              </div>
              <span class="text-sm font-medium m-3 overflow-ellipsis">
                Settings
              </span>
            </Button>
            <Button
              variant="ghost"
              class="cursor-pointer w-full flex justify-start h-[64px]"
              onclick={() => {
                handleLogout();
                isOpen = false;
              }}
            >
              <div class="flex items-center w-12 h-12">
                <LogOut class="flex !w-8 !h-8 mx-2" />
              </div>
              <span class="text-sm font-medium m-3 overflow-ellipsis">
                Logout
              </span>
            </Button>
          {:else}
            <Button
              variant="ghost"
              class="cursor-pointer w-full flex justify-start h-[64px]"
              onclick={() => {
                goto("/auth/login");
                isOpen = false;
              }}
            >
              <div class="flex items-center w-12 h-12">
                <LogIn class="flex !w-8 !h-8 mx-2" />
              </div>
              <span class="text-sm font-medium m-3 overflow-ellipsis">
                Login
              </span>
            </Button>
          {/if}
        </div>
      {/if}
    </ScrollArea>
  </Sheet.Content>
</Sheet.Root>
