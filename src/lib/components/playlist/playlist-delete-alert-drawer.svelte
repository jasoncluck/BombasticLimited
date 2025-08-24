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
        <div
          class="bg-destructive/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg"
        >
          <CircleMinus class="text-destructive !h-6 !w-6" />
        </div>
        <div class="flex flex-col gap-1">
          <Drawer.Title class="text-lg font-semibold">
            Delete Public Playlist
          </Drawer.Title>
        </div>
      </div>

      <div class="bg-muted/50 mb-4 flex items-center gap-3 rounded-lg p-3">
        {#if playlist.processedImageUrl}
          <div class="h-12 w-12 shrink-0 overflow-hidden rounded">
            <img
              src={playlist.processedImageUrl}
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

      <Drawer.Description class="text-muted-foreground text-sm leading-relaxed">
        You are about to delete the public playlist "{playlist.name}". This
        action will:
        <br /><br />
        • Permanently remove this playlist
        <br />
        • Remove it from all followers' profiles
        <br />
        • This action cannot be undone
      </Drawer.Description>
    </Drawer.Header>

    <hr />

    <div class="space-y-3 px-4 py-6">
      <Button
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full justify-center"
        onclick={confirmDelete}
      >
        <CircleMinus class="drawer-icon" />
        Delete Playlist
      </Button>

      <Button
        variant="outline"
        class="w-full justify-center"
        onclick={cancelDelete}
      >
        Cancel
      </Button>
    </div>

    <Drawer.Footer class="drawer-footer">
      <Drawer.Close
        class={buttonVariants({
          class: 'drawer-button-footer',
          variant: 'ghost',
        })}
        data-drawer-close
      >
        Close
      </Drawer.Close>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>
