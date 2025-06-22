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
    handleUpdatePlaylistPosition,
  } from "./playlist/playlist-service";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { fade } from "svelte/transition";
  import type { Playlist } from "$lib/supabase/playlists";
  import { getContentState } from "$lib/state/content.svelte";
  import ScrollArea from "./ui/scroll-area/scroll-area.svelte";
  import { createDragImage } from "$lib/utils/dragdrop";
  import { page } from "$app/state";
  import { onMount } from "svelte";

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

  // Auto-scroll related state
  let drawerViewportRef = $state<HTMLElement | null>(null);
  let scrollInterval = $state<number | null>(null);
  let scrollDirection = $state<"up" | "down" | null>(null);
  let isScrolling = $state(false);

  let initialTouchY = $state<number | null>(null);
  let hasDragStarted = $state(false);
  let dragTimeoutId = $state<number | null>(null);
  let scrollThreshold = 25; // Increased threshold
  let dragThreshold = 300; // Longer delay

  const scrollSpeed = 8; // Slower scroll speed
  const scrollZoneSize = 60; // Larger scroll zones

  const endDropzoneClasses = ["border-transparent"];

  function startAutoScroll() {
    if (scrollInterval !== null) {
      window.clearInterval(scrollInterval);
    }

    if (drawerViewportRef && scrollDirection && hasDragStarted) {
      isScrolling = true;
      scrollInterval = window.setInterval(() => {
        if (drawerViewportRef && scrollDirection && hasDragStarted) {
          if (scrollDirection === "up") {
            drawerViewportRef.scrollTop = Math.max(
              0,
              drawerViewportRef.scrollTop - scrollSpeed,
            );
          } else if (scrollDirection === "down") {
            drawerViewportRef.scrollTop += scrollSpeed;
          }
        }
      }, 16);
    }
  }

  function stopAutoScroll() {
    if (scrollInterval !== null) {
      window.clearInterval(scrollInterval);
      scrollInterval = null;
      scrollDirection = null;
      isScrolling = false;
    }
  }

  function handleDrawerDragOver(e: DragEvent) {
    if (!contentState.dragContentType || !drawerViewportRef) return;
    e.preventDefault();

    const rect = drawerViewportRef.getBoundingClientRect();
    const mouseY = e.clientY;

    if (mouseY - rect.top < scrollZoneSize) {
      if (scrollDirection !== "up") {
        scrollDirection = "up";
        startAutoScroll();
      }
    } else if (rect.bottom - mouseY < scrollZoneSize) {
      if (scrollDirection !== "down") {
        scrollDirection = "down";
        startAutoScroll();
      }
    } else if (scrollDirection !== null) {
      stopAutoScroll();
    }
  }

  function handleMouseEnter(index: number) {
    if (!isScrolling && draggedIndex === null) {
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
        classes +=
          " after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10";
      } else {
        classes +=
          " before:absolute before:left-0 before:-top-0 before:w-full before:h-[2px] before:bg-primary before:z-10";
      }
    }
    return classes;
  }

  function getButtonClasses(index: number, isSelectedPlaylist: boolean) {
    let classes =
      "h-[64px] w-full border border-transparent relative cursor-pointer transition-colors duration-0";

    classes += ` ${getPlaylistDragClasses(index)}`;

    if (hoveredIndex === index && !isScrolling && draggedIndex === null) {
      classes += " hover:bg-secondary";
    } else if (!isSelectedPlaylist) {
      classes += " hover:bg-transparent ";
    }

    if (isSelectedPlaylist) {
      classes += " bg-secondary";
    }

    // Add touch-action based on drag state
    if (hasDragStarted && isDragging) {
      classes += " [touch-action:none]";
    } else {
      classes += " [touch-action:pan-y]"; // Allow vertical scrolling
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
    hasDragStarted = false;
    stopAutoScroll();

    // Clear any pending drag timeout
    if (dragTimeoutId !== null) {
      window.clearTimeout(dragTimeoutId);
      dragTimeoutId = null;
    }
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

  function handleContextMenu(e: Event) {
    e.preventDefault();
  }

  function initiateDragMode(index: number) {
    if (
      touchStartY !== null &&
      initialTouchY !== null &&
      !touchMoved &&
      Date.now() - (touchStartTime || 0) >= dragThreshold
    ) {
      const currentDelta = Math.abs(touchStartY - initialTouchY);
      if (currentDelta < scrollThreshold) {
        isDragging = true;
        hasDragStarted = true;
        draggedIndex = index;
        contentState.dragContentType = "playlist";
        hoveredIndex = null;
      }
    }
    dragTimeoutId = null;
  }

  // Simplified touch handlers that don't use preventDefault
  function handleTouchStart(e: TouchEvent, index: number) {
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    initialTouchY = touch.clientY;
    touchStartTime = Date.now();
    touchMoved = false;
    hasDragStarted = false;

    // Clear any existing timeout
    if (dragTimeoutId !== null) {
      window.clearTimeout(dragTimeoutId);
    }

    // Start drag after delay
    dragTimeoutId = window.setTimeout(() => {
      initiateDragMode(index);
    }, dragThreshold);
  }

  function handleTouchMove(e: TouchEvent) {
    if (!touchStartY || !initialTouchY) return;

    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - initialTouchY);

    // If user moved significantly, they're scrolling
    if (deltaY > scrollThreshold) {
      touchMoved = true;

      // Cancel drag if we haven't started yet
      if (!hasDragStarted && !isDragging) {
        if (dragTimeoutId !== null) {
          window.clearTimeout(dragTimeoutId);
          dragTimeoutId = null;
        }
        touchStartY = null;
        initialTouchY = null;
        touchStartTime = null;
        return;
      }
    }

    // Handle auto-scroll during drag
    if (isDragging && draggedIndex !== null && hasDragStarted) {
      if (drawerViewportRef) {
        const rect = drawerViewportRef.getBoundingClientRect();
        const touchY = touch.clientY;

        if (touchY - rect.top < scrollZoneSize) {
          if (scrollDirection !== "up") {
            scrollDirection = "up";
            startAutoScroll();
          }
        } else if (rect.bottom - touchY < scrollZoneSize) {
          if (scrollDirection !== "down") {
            scrollDirection = "down";
            startAutoScroll();
          }
        } else if (scrollDirection !== null) {
          stopAutoScroll();
        }
      }

      // Find target for reordering
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
    if (dragTimeoutId !== null) {
      window.clearTimeout(dragTimeoutId);
      dragTimeoutId = null;
    }

    if (
      isDragging &&
      draggedIndex !== null &&
      targetIndex !== null &&
      hasDragStarted
    ) {
      handlePlaylistDrop(e, targetIndex);
    } else if (!touchMoved && !isDragging && !hasDragStarted) {
      goto(`/playlist/${encodeURI(playlists[index].short_id)}`);
      isOpen = false;
    }

    touchStartY = null;
    initialTouchY = null;
    touchStartTime = null;
    isDragging = false;
    touchMoved = false;
    hasDragStarted = false;
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

  onMount(() => {
    return () => {
      if (scrollInterval !== null) {
        window.clearInterval(scrollInterval);
      }
      if (dragTimeoutId !== null) {
        window.clearTimeout(dragTimeoutId);
      }
    };
  });
</script>

<Sheet.Root bind:open={isOpen}>
  <Sheet.Trigger><Menu class="cursor-pointer" /></Sheet.Trigger>
  <Sheet.Content
    side="left"
    class="flex flex-col gap-2 mx-2 pt-12 min-w-[300px]"
  >
    <ScrollArea
      bind:viewportRef={drawerViewportRef}
      data-scroll-container
      ondragover={handleDrawerDragOver}
    >
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
              )} cursor-pointer w-full flex justify-start h-[64px] select-none"
              draggable={true}
              data-playlist-index={i}
              oncontextmenu={handleContextMenu}
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
              ontouchmove={(e) => handleTouchMove(e)}
              ontouchend={(e) => handleTouchEnd(e, i)}
              onclick={async (e) => {
                if (isDragging || touchMoved || hasDragStarted) {
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

              <span class="text-sm font-medium m-3 overflow-ellipsis">
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
