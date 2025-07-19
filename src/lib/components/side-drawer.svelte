<script lang="ts">
  import { goto, invalidate } from "$app/navigation";
  import { SOURCES, SOURCE_INFO, type Source } from "$lib/constants/source";
  import { activeStreams } from "$lib/state/streaming.svelte";
  import {
    Circle,
    Edit,
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
  import {
    updateProfileSources,
    type UserProfile,
  } from "$lib/supabase/user-profiles";
  import Badge from "./ui/badge/badge.svelte";
  import EditListDrawer from "./content/drawer/edit-list-drawer.svelte";
  import EditSourceDrawer from "./content/drawer/edit-source-drawer.svelte";

  let {
    playlists = $bindable(),
    handleLogout,
    userProfile,
    session,
    supabase,
  }: {
    playlists: UserPlaylist[];
    handleLogout: () => void;
    userProfile: UserProfile | null;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const flipDurationMs = 300;

  let isOpen = $state(false);

  const selectedPlaylistIdParam = $derived(page.params.shortId);

  function handlePlaylistClick(playlist: Playlist) {
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
    isOpen = false;
  }

  async function handlePlaylistReorder(
    oldIndex: number,
    newIndex: number,
    item: Playlist | { id: string | number },
  ) {
    const newPosition = playlists.length - newIndex;

    try {
      await handleUpdatePlaylistPosition({
        position: newPosition,
        playlist: item as Playlist,
        session,
        supabase,
      });
    } catch (error) {
      console.error("Error updating video position:", error);
      throw error;
    }
  }

  // Update the handleSourceReorder function in your navigation drawer:
  async function handleSourceReorder(sources: Source[]) {
    if (!session || !userProfile) return;

    // Optimistically update the local state immediately
    const previousSources = userProfile.sources;
    userProfile = {
      ...userProfile,
      sources: sources,
    };

    try {
      await updateProfileSources({
        sources,
        session,
        supabase,
      });
    } catch (error) {
      console.error("Error updating source positions:", error);
      // Revert on error
      userProfile = {
        ...userProfile,
        sources: previousSources,
      };
      throw error;
    }
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

          <Sheet.Title class="mx-2 mt-4 mb-2 flex flex-col gap-4">
            Channels

            {#if userProfile}
              <EditSourceDrawer
                sources={userProfile.sources ?? []}
                title="Reorder sources"
                subtitle="Drag the handle to reorder sources"
                onReorder={handleSourceReorder}
                onClose={() => {
                  invalidate("supabase:db:profiles");
                }}
              >
                {#snippet trigger()}
                  <Badge
                    class="flex items-center gap-2 bg-secondary cursor-pointer"
                  >
                    <Edit />
                    Reorder
                  </Badge>
                {/snippet}

                {#snippet itemRenderer(source)}
                  {@const sourceInfo = SOURCE_INFO[source]}
                  <div class="w-full flex items-center gap-2 m-1">
                    <div class="h-12 w-12 flex-none">
                      <img
                        src={sourceInfo.image}
                        class="h-12 w-12 object-cover cursor-pointer"
                        alt={`Image for channel: ${sourceInfo.displayName}`}
                      />
                    </div>
                    <div class="flex flex-col items-start">
                      <p>
                        {sourceInfo.displayName}
                      </p>
                    </div>
                  </div>
                {/snippet}
              </EditSourceDrawer>
            {/if}
          </Sheet.Title>

          {#each userProfile?.sources ?? SOURCES as source (source)}
            <div animate:flip={{ duration: flipDurationMs }}>
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
                <div class="w-12 h-12 flex-none">
                  <img
                    src={SOURCE_INFO[source].image}
                    alt={SOURCE_INFO[source].displayName}
                    class="h-12 w-12 object-cover cursor-pointer"
                  />
                </div>
                <span class="text-sm font-medium m-3 overflow-ellipsis">
                  {SOURCE_INFO[source].displayName}
                </span>
              </Button>
            </div>
          {/each}

          <Sheet.Title class="mx-2 mt-4 mb-2 flex flex-col gap-4">
            Playlists

            {#if session && playlists.length > 1}
              <EditListDrawer
                items={playlists}
                title="Reorder playlist videos"
                onReorder={handlePlaylistReorder}
                onClose={() => {
                  invalidate("supabase:db:playlists");
                }}
              >
                {#snippet trigger()}
                  <Badge class="flex items-center gap-2 bg-secondary">
                    <Edit />
                    Reorder</Badge
                  >
                {/snippet}

                {#snippet itemRenderer(item)}
                  {@const playlist = item as Playlist}
                  <div class="w-full flex items-center gap-2 m-1">
                    {#if playlist.processedImageUrl}
                      <div class="h-12 w-12 flex-none">
                        <img
                          src={playlist.processedImageUrl}
                          class="h-12 w-12 object-cover cursor-pointer"
                          alt={`Image for playlist: ${playlist.name}`}
                        />
                      </div>
                    {:else}
                      <div
                        class="h-12 w-12 flex items-center justify-center flex-none"
                      >
                        <ListVideo class="!h-8 !w-8" />
                      </div>
                    {/if}
                    <div class="flex flex-col items-start">
                      <p>
                        {playlist.name}
                      </p>
                      <p class="text-muted-foreground">
                        {playlist.type}
                      </p>
                    </div>
                  </div>
                {/snippet}
              </EditListDrawer>
            {/if}
          </Sheet.Title>

          {#if session}
            <Button
              variant="ghost"
              class="cursor-pointer w-full flex justify-start h-[64px]"
              onclick={async () => {
                const { playlist } = await handleCreatePlaylist({
                  playlists,
                  session,
                  supabase,
                });

                if (playlist) {
                  goto(`/playlist/${encodeURI(playlist.short_id)}`);
                  isOpen = false;
                }
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

          <!-- Simple playlist list with flip animation -->
          {#if session && playlists.length > 0}
            {#each playlists as playlist (playlist.id)}
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
                      <div class="w-12 h-12 flex-none">
                        <img
                          src={playlist.processedImageUrl}
                          class="h-12 w-12 object-cover cursor-pointer"
                          alt={`Image for playlist: ${playlist.name}`}
                        />
                      </div>
                    {:else}
                      <div
                        class="h-12 w-12 flex items-center justify-center flex-none"
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
          {/if}

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
