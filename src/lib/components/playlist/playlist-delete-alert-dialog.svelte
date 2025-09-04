<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Database } from '$lib/supabase/database.types';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { SidebarState } from '$lib/state/sidebar.svelte';
  import { handleDeletePlaylist } from './playlist-service';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  interface PlaylistDeleteAlertDialogProps {
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
  }: PlaylistDeleteAlertDialogProps = $props();

  async function confirmDelete() {
    const result = await handleDeletePlaylist({
      playlist,
      sidebarState,
      session,
      supabase,
    });

    // Close the dialog
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

<AlertDialog.Root bind:open {onOpenChange}>
  <AlertDialog.Content class="sm:max-w-[425px]">
    <AlertDialog.Header>
      <AlertDialog.Title>Delete Public Playlist</AlertDialog.Title>
      <AlertDialog.Description>
        You are about to delete the public playlist: <b>{playlist.name} </b>.
        Deleting this will also remove the playlist from any followers'
        accounts.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancelDelete}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={confirmDelete}
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        Delete Playlist
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
