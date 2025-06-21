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
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import {
    handleCreatePlaylist,
    handleDeletePlaylist,
  } from "./playlist/playlist-service";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { fade } from "svelte/transition";
  import type { Playlist } from "$lib/supabase/playlists";
  import { getContentState } from "$lib/state/content.svelte";

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

  const contentState = getContentState();
</script>

<Sheet.Root bind:open={isOpen}>
  <Sheet.Trigger><Menu class="cursor-pointer" /></Sheet.Trigger>
  <Sheet.Content
    side="left"
    class="flex flex-col gap-2 mx-2 pt-12 min-w-[300px]"
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
          <span class="text-sm font-medium m-3 overflow-ellipsis"> Home </span>
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
        {#each playlists as playlist (playlist.id)}
          <ContextMenu.Root>
            <ContextMenu.Content>
              <ContextMenu.Item
                onclick={() =>
                  handleDeletePlaylist({
                    playlist,
                    session,
                    supabase,
                  })}>Delete Playlist</ContextMenu.Item
              >
            </ContextMenu.Content>
            <ContextMenu.Trigger>
              <Button
                variant="ghost"
                class="cursor-pointer w-full flex justify-start h-[64px]"
                onclick={() => {
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
            </ContextMenu.Trigger>
          </ContextMenu.Root>
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
  </Sheet.Content>
</Sheet.Root>
