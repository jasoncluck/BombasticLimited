<script lang="ts">
  import { goto, invalidate } from '$app/navigation';
  import { SOURCES, SOURCE_INFO, type Source } from '$lib/constants/source';
  import {
    House,
    ListVideo,
    LogIn,
    LogOut,
    Menu,
    Pencil,
    Plus,
    Settings,
  } from '@lucide/svelte';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import {
    handleCreatePlaylist,
    handleUpdatePlaylistPosition,
  } from './playlist/playlist-service';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { fade } from 'svelte/transition';
  import type { Playlist } from '$lib/supabase/playlists';
  import ScrollArea from './ui/scroll-area/scroll-area.svelte';
  import { page } from '$app/state';
  import { flip } from 'svelte/animate';
  import { updateProfileSources } from '$lib/supabase/user-profiles';
  import Badge from './ui/badge/badge.svelte';
  import EditListDrawer from './content/drawer/edit-list-drawer.svelte';
  import EditSourceDrawer from './content/drawer/edit-source-drawer.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import StreamingIndicator from './streaming/streaming-indicator.svelte';

  let {
    handleLogout,
    session,
    supabase,
  }: {
    handleLogout: () => void;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const sidebarState = getSidebarState();
  let { playlists, userProfile } = $derived(sidebarState);

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
    item: Playlist | { id: string | number }
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
      console.error('Error updating video position:', error);
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
        supabase,
      });
    } catch (error) {
      console.error('Error updating source positions:', error);
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
    data-testid="navigation-drawer-trigger"
    class={buttonVariants({
      variant: 'ghost',
      class: 'ghost-button-minimal',
    })}
    ><Menu class="cursor-pointer" />
    <span class="sr-only"> Toggle Menu</span></Sheet.Trigger
  >
  <Sheet.Content
    side="left"
    class="flex w-[300px] flex-col gap-2 overflow-auto pt-12"
  >
    <ScrollArea class="pr-2">
      {#if isOpen}
        <div transition:fade class="px-2">
          <Button
            variant="ghost"
            class="flex h-[64px] w-full cursor-pointer justify-start"
            href="/"
            onclick={() => {
              isOpen = false;
            }}
          >
            <div class="flex h-12 w-12 items-center">
              <House class="mx-2 !h-8 !w-8 " />
            </div>
            <span class="m-3 text-sm font-medium overflow-ellipsis">
              Home
            </span>
          </Button>

          <div class="mx-2 mt-4 mb-2 flex flex-col gap-4">
            <Sheet.Title>Channels</Sheet.Title>

            {#if userProfile}
              <EditSourceDrawer
                sources={userProfile.sources ?? []}
                title="Reorder sources"
                subtitle="Drag the handle to reorder sources."
                onReorder={handleSourceReorder}
                onClose={() => {
                  invalidate('supabase:db:profiles');
                }}
              >
                {#snippet trigger()}
                  <Badge
                    class="bg-secondary flex cursor-pointer items-center gap-2"
                  >
                    <Pencil />
                    Reorder
                  </Badge>
                {/snippet}

                {#snippet itemRenderer(source)}
                  {@const sourceInfo = SOURCE_INFO[source]}
                  <div class="m-1 flex w-full items-center gap-2">
                    <div class="h-12 w-12 flex-none">
                      <enhanced:img
                        src={sourceInfo.image}
                        class="h-12 w-12 cursor-pointer object-cover"
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
          </div>

          {#each userProfile?.sources ?? SOURCES as source (source)}
            <div animate:flip={{ duration: flipDurationMs }}>
              <Button
                variant="ghost"
                class="relative flex h-[64px] w-full cursor-pointer justify-start"
                onclick={() => {
                  goto(`/${source}`);
                  isOpen = false;
                }}
                title={SOURCE_INFO[source].displayName}
              >
                <div class="absolute flex w-full grow items-center">
                  <StreamingIndicator
                    isStreaming={sidebarState.isSourceStreaming(source)}
                    size="sm"
                  />
                  <span class="sr-only">Live now</span>
                  <div class="h-12 w-12 flex-none">
                    <enhanced:img
                      src={SOURCE_INFO[source].image}
                      alt={SOURCE_INFO[source].displayName}
                      class="h-12 w-12 cursor-pointer object-cover"
                    />
                  </div>
                  <span class="m-3 text-sm font-medium overflow-ellipsis">
                    {SOURCE_INFO[source].displayName}
                  </span>
                </div>
              </Button>
            </div>
          {/each}

          <div class="mx-2 mt-4 mb-2 flex flex-col gap-4">
            <Sheet.Title>Playlists</Sheet.Title>

            {#if session && playlists.length > 1}
              <EditListDrawer
                items={playlists}
                title="Reorder playlist videos"
                onReorder={handlePlaylistReorder}
                onClose={() => {
                  sidebarState.refreshData();
                }}
              >
                {#snippet trigger()}
                  <Badge class="bg-secondary flex items-center gap-2">
                    <Pencil />
                    Reorder</Badge
                  >
                {/snippet}

                {#snippet itemRenderer(item)}
                  {@const playlist = item as Playlist}
                  <div class="m-1 flex w-full items-center gap-2">
                    {#if playlist.image_url}
                      <div class="h-12 w-12 flex-none">
                        <img
                          src={playlist.image_url}
                          class="h-12 w-12 cursor-pointer object-cover"
                          alt={`Image for playlist: ${playlist.name}`}
                        />
                      </div>
                    {:else}
                      <div
                        class="flex h-12 w-12 flex-none items-center justify-center"
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
          </div>

          {#if session}
            <Button
              variant="ghost"
              class="flex h-[64px] w-full cursor-pointer justify-start"
              onclick={async () => {
                const { playlist } = await handleCreatePlaylist({
                  sidebarState,
                  session,
                  supabase,
                });

                if (playlist) {
                  goto(`/playlist/${encodeURI(playlist.short_id)}`);
                  isOpen = false;
                }
              }}
            >
              <div class="flex h-12 w-12 items-center">
                <Plus class="mx-2 flex !h-8 !w-8" />
              </div>
              <span class="m-3 text-sm font-medium overflow-ellipsis">
                Add Playlist
              </span>
            </Button>
          {:else}
            <Sheet.Description>
              <p class="m-3 text-sm font-medium overflow-ellipsis">
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
                  class="hover:bg-secondary relative flex h-[64px] w-full cursor-pointer justify-start transition-colors duration-200 select-none {isSelectedPlaylist
                    ? 'bg-secondary'
                    : ''}"
                  onclick={() => handlePlaylistClick(playlist)}
                  title={playlist.name}
                >
                  <div class="flex items-center overflow-hidden">
                    {#if playlist.image_url}
                      <div class="h-12 w-12 flex-none">
                        <img
                          src={playlist.image_url}
                          class="h-12 w-12 cursor-pointer object-cover"
                          alt={`Image for playlist: ${playlist.name}`}
                        />
                      </div>
                    {:else}
                      <div
                        class="flex h-12 w-12 flex-none items-center justify-center"
                      >
                        <ListVideo class="!h-8 !w-8" />
                      </div>
                    {/if}

                    <span
                      class="mr-4 min-w-0 flex-1 overflow-hidden pl-3 text-sm [word-break:keep-all] text-clip whitespace-nowrap"
                    >
                      {playlist.name}
                    </span>
                  </div>
                </Button>
              </div>
            {/each}
          {/if}

          <div class="mx-2 mt-4 mb-2 flex flex-col gap-4">
            <Sheet.Title>Account</Sheet.Title>
          </div>

          {#if session}
            <Button
              variant="ghost"
              class="flex h-[64px] w-full cursor-pointer justify-start"
              onclick={() => {
                goto(`/account`);
                isOpen = false;
              }}
            >
              <div class="flex h-12 w-12 items-center">
                <Settings class="mx-2 flex !h-8 !w-8" />
              </div>
              <span class="m-3 text-sm font-medium overflow-ellipsis">
                Settings
              </span>
            </Button>
            <Button
              variant="ghost"
              class="flex h-[64px] w-full cursor-pointer justify-start"
              onclick={() => {
                handleLogout();
                isOpen = false;
              }}
            >
              <div class="flex h-12 w-12 items-center">
                <LogOut class="mx-2 flex !h-8 !w-8" />
              </div>
              <span class="m-3 text-sm font-medium overflow-ellipsis">
                Logout
              </span>
            </Button>
          {:else}
            <Button
              variant="ghost"
              class="flex h-[64px] w-full cursor-pointer justify-start"
              onclick={() => {
                goto('/auth/login');
                isOpen = false;
              }}
            >
              <div class="flex h-12 w-12 items-center">
                <LogIn class="mx-2 flex !h-8 !w-8" />
              </div>
              <span class="m-3 text-sm font-medium overflow-ellipsis">
                Login
              </span>
            </Button>
          {/if}
        </div>
      {/if}
    </ScrollArea>
  </Sheet.Content>
</Sheet.Root>
