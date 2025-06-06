<script lang="ts">
  import { goto } from "$app/navigation";
  import { SOURCES, SOURCE_INFO } from "$lib/constants/source";
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { Circle, House, ListVideo, Menu, Plus } from "@lucide/svelte";
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

  let {
    playlists,
    session,
    supabase,
  }: {
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();
  let isOpen = $state(false);
</script>

<Sheet.Root bind:open={isOpen}>
  <Sheet.Trigger><Menu /></Sheet.Trigger>
  <Sheet.Content
    side="left"
    class="flex flex-col gap-2 mx-2 pt-12 min-w-[300px]"
  >
    {#if isOpen}
      <div transition:fade>
        <Button
          variant="ghost"
          class="w-full flex justify-start h-[64px]"
          onclick={() => {
            goto(`/`);
            isOpen = false;
          }}
        >
          <House class="flex !w-8 !h-8 mx-2 " />
          <span class="text-sm font-medium m-3 overflow-ellipsis"> Home </span>
        </Button>
        {#each SOURCES as source (source)}
          <Button
            variant="ghost"
            class="w-full flex justify-start h-[64px]"
            onclick={() => {
              goto(`/${source}`);
              isOpen = false;
            }}
            title={SOURCE_INFO[source].displayName}
          >
            {#if activeStreams.sources.includes(source)}
              <Circle
                class="absolute left-0 bottom-0"
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
        <Sheet.Title class="pt-4">Playlists</Sheet.Title>
        <Button
          variant="ghost"
          class="w-full flex justify-start h-[64px]"
          onclick={() => {
            handleCreatePlaylist({
              playlists,
              session,
              supabase,
            });
            isOpen = false;
          }}
        >
          <Plus class="flex !w-8 !h-8 mx-2" />
          <span class="text-sm font-medium m-3 overflow-ellipsis">
            Add Playlist
          </span>
        </Button>
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
                class="w-full flex justify-start h-[64px]"
                onclick={() => {
                  goto(`/playlist/${encodeURI(playlist.short_id)}`);
                  isOpen = false;
                }}
                title={playlist.name}
              >
                {#if playlist.thumbnail_maxres_url || playlist.thumbnail_url}
                  <div
                    class="h-12 min-w-12 bg-cover bg-center"
                    style="background-image: url('{playlist.thumbnail_maxres_url ??
                      playlist.thumbnail_url}');"
                    aria-label={playlist.name}
                    role="img"
                  ></div>
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
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
