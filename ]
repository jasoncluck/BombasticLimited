<script lang="ts">
  import * as Drawer from '$lib/components/ui/drawer';
  import Button, {
    buttonVariants,
  } from '$lib/components/ui/button/button.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Database } from '$lib/supabase/database.types';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { SidebarState } from '$lib/state/sidebar.svelte';
  import { handleDeletePlaylist } from './playlist-service';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { CircleMinus, ListVideo } from '@lucide/svelte';

  interface PlaylistDeleteAlertDrawerProps {
    playlist: Playlist;
    sidebarState: SidebarState;
    session: Session | null;
    supabase: SupabaseClient<Database>;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }

  let {
    playlist,
    sidebarState,
    session,
    supabase,
    open = $bindable(false),
    onOpenChange,
  }: PlaylistDeleteAlertDrawerProps = $props();

  async function confirmDelete() {
    const result = await handleDeletePlaylist({
      playlist,
      sidebarState,
      session,
      supabase,
    });

    // Close the drawer
    open = false;
    if (onOpenChange) {
      onOpenChange(false);
    }

    // Navigate away if we're currently viewing this playlist
    if (
      !result?.error &&
      page.url.pathname === `/playlist/${playlist.short_id}`
    ) {
      goto('/');
    }
  }

  function cancelDelete() {
    open = false;
    if (onOpenChange) {
      onOpenChange(false);
    }
  }
</script>

<Drawer.Root bind:open {onOpenChange}>
  <Drawer.Content class="outline-hiddden" data-drawer-content>
    <Drawer.Header class="mx-4 text-left">
      <div class="mb-4 flex items-center gap-3">
        <div class="flex flex-col gap-1">
          <Drawer.Title class="text-lg font-semibold">
            {playlist.type === 'Public'
              ? 'Delete Public Playlist'
              : 'Delete Playlist'}
          </Drawer.Title>
        </div>
      </div>

      <div class="bg-muted/50 mb-4 flex items-center gap-3 rounded-lg p-3">
        {#if playlist.image_url}
          <div class="h-12 w-12 shrink-0 overflow-hidden rounded">
            <img
              src={playlist.image_url}
              alt={playlist.name}
              class="h-full w-full object-cover"
            />
          </div>
        {:else}
          <div
            class="bg-muted flex h-12 w-12 flex-shrink-0 items-center justify-center rounded"
          >
            <ListVideo class="!h-6 !w-6" />
          </div>
        {/if}
        <div class="flex min-w-0 flex-col gap-1">
          <p class="truncate text-sm font-medium">
            {playlist.name}
          </p>
          <p class="text-muted-foreground text-xs">
            {playlist.type} Playlist
          </p>
        </div>
      </div>

      {#if playlist.type === 'Public'}
        <Drawer.Description
          class="text-muted-foreground text-sm leading-relaxed"
        >
          You are about to delete the public playlist: <b>{playlist.name} </b>.
          Users who follow this playlist will have access for 2 more weeks
          before it's removed from their account.
        </Drawer.Description>
      {:else}
        <Drawer.Description
          class="text-muted-foreground text-sm leading-relaxed"
        >
          You are about to delete the private playlist: <b>{playlist.name} </b>.
        </Drawer.Description>
      {/if}
    </Drawer.Header>

    <hr />

    <Drawer.Footer class="drawer-footer">
      <div class="space-y-3 px-4 py-6">
        <Button
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full justify-center"
          onclick={confirmDelete}
        >
          Delete Playlist
        </Button>

        <Button
          variant="outline"
          class="w-full justify-center"
          onclick={cancelDelete}
        >
          Close
        </Button>
      </div>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>
