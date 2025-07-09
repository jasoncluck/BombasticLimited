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
  import type { Playlist, UserPlaylist } from "$lib/supabase/playlists";
  import ScrollArea from "./ui/scroll-area/scroll-area.svelte";
  import { page } from "$app/state";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import type { DndEvent } from "svelte-dnd-action";
  import type { Profile } from "$lib/supabase/profiles";

  let {
    playlists = $bindable(),
    handleLogout,
    userProfile,
    session,
    supabase,
  }: {
    playlists: UserPlaylist[];
    handleLogout: () => void;
    userProfile: Profile | null;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const flipDurationMs = 300;

  let isOpen = $state(false);
  let dndPlaylists = $derived<(Playlist & { id: string | number })[]>([]);

  const selectedPlaylistIdParam = $derived(page.params.shortId);

  // Transform playlists to include proper id for dnd-action using $effect
  $effect(() => {
    dndPlaylists = playlists.map((playlist, index) => ({
      ...playlist,
      id: playlist.id || index, // Ensure each item has an id
    }));
  });

  function handleDndConsider(e: CustomEvent<DndEvent>) {
    // Update the playlists during drag (for visual feedback)
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

  function handlePlaylistClick(playlist: Playlist) {
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
    isOpen = false;
  }
</script>

<Sheet.Root bind:open={isOpen}>
  <Sheet.Trigger
    ><Menu class="cursor-pointer" />
    <span class="sr-only"> Toggle Menu</span></Sheet.Trigger
  >
  <Sheet.Content
    side="left"
    class="flex flex-col gap-2 pt-12 w-[300px] overflow-hidden"
  >
    <ScrollArea class="pr-2">
      {#if isOpen}
        <div transition:fade class="px-2">
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
                <span class="sr-only">Live now</span>
              {/if}
              <div class="w-12 h-12">
                <img
                  src={SOURCE_INFO[source].image}
                  alt={SOURCE_INFO[source].displayName}
                  class="h-full w-full cursor-pointer"
                />
              </div>
              <span class="text-sm font-medium m-3 overflow-ellipsis">
                {SOURCE_INFO[source].displayName}
              </span>
            </Button>
          {/each}

          <Sheet.Title class="mx-2 mt-4 mb-2">Playlists</Sheet.Title>

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

          <!-- DnD Zone for Playlists -->
          {#if session && dndPlaylists.length > 0}
            <div
              use:dndzone={{
                items: dndPlaylists,
                flipDurationMs,
                type: "playlist",
                dropTargetStyle: {
                  outline: "rgba(99, 102, 241, 0.5) solid 2px",
                  backgroundColor: "rgba(99, 102, 241, 0.1)",
                },
                dropTargetClasses: ["dnd-drop-target"],
              }}
              onconsider={handleDndConsider}
              onfinalize={handleDndFinalize}
            >
              {#each dndPlaylists as playlist (playlist.id)}
                {@const isSelectedPlaylist =
                  selectedPlaylistIdParam === playlist.short_id}
                <div animate:flip={{ duration: flipDurationMs }} class="w-full">
                  <Button
                    variant="ghost"
                    class="cursor-pointer relative w-full flex justify-start h-[64px] select-none transition-colors duration-200 hover:bg-secondary {isSelectedPlaylist
                      ? 'bg-secondary'
                      : ''}"
                    onclick={() => handlePlaylistClick(playlist)}
                    title={playlist.name}
                  >
                    <div class="flex items-center overflow-hidden">
                      {#if playlist.processedImageUrl}
                        <div class="w-12 h-12 flex-shrink-0">
                          <img
                            src={playlist.processedImageUrl}
                            class="h-full w-full cursor-pointer object-cover"
                            alt={`Image for playlist: ${playlist.name}`}
                          />
                        </div>
                      {:else}
                        <div
                          class="h-12 w-12 flex items-center justify-center flex-shrink-0"
                        >
                          <ListVideo class="!h-8 !w-8" />
                        </div>
                      {/if}

                      <span
                        class="text-sm pl-3 mr-4 overflow-hidden text-clip whitespace-nowrap flex-1 min-w-0 [word-break:keep-all]"
                      >
                        {playlist.name}
                      </span>
                    </div>
                  </Button>
                </div>
              {/each}
            </div>
          {/if}

          <Sheet.Title class="mx-2 mt-4 mb-2">Account</Sheet.Title>
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
