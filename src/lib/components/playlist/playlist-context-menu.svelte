<script lang="ts">
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Database } from '$lib/supabase/database.types';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import PlaylistDeleteAlertDialog from './playlist-delete-alert-dialog.svelte';
  import {
    handleDeletePlaylist,
    handleUnfollowPlaylist,
  } from '../playlist/playlist-service';
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { getPageState } from '$lib/state/page.svelte';

  interface ContentContextMenuProps {
    playlist: Playlist;
    selectedPlaylistIdParam?: string;
    isSidebarCollapsed: boolean;
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    children: Snippet<[]>;
  }

  let {
    playlist,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
    children,
  }: ContentContextMenuProps = $props();

  const pageState = getPageState();
  const contentState = getContentState();
  const sidebarState = getSidebarState();

  let openDialog = $state(false);
  let openContextMenu = $state(false);
  let showDeleteDialog = $state(false);

  $effect(() => {
    if (
      openDialog &&
      contentState.selectedVideosBySection[sectionId].length < 1
    ) {
      openDialog = false;
    }
  });

  $effect(() => {
    const sidebarViewport = pageState.viewportRefs.sidebarViewportRef;
    const contentViewport = pageState.viewportRefs.contentViewportRef;

    if (openContextMenu) {
      // Block scrolling when dropdown is open
      if (sidebarViewport) {
        sidebarViewport.style.overflow = 'hidden';
      }
      if (contentViewport) {
        contentViewport.style.overflow = 'hidden';
      }
    } else {
      // Restore scrolling when dropdown is closed
      if (sidebarViewport) {
        sidebarViewport.style.overflow = 'auto';
      }
      if (contentViewport) {
        contentViewport.style.overflow = 'auto';
      }
    }
  });

  async function handleDeleteOrUnfollow() {
    if (playlist.created_by !== session?.user.id) {
      // User doesn't own playlist - unfollow
      const data = await handleUnfollowPlaylist({
        playlist,
        sidebarState,
        supabase,
        session,
      });

      if (
        !data?.error &&
        page.url.pathname === `/playlist/${playlist.short_id}`
      ) {
        goto('/');
      }
    } else {
      // User owns playlist - check if it's public
      // Show confirmation dialog for public playlists
      showDeleteDialog = true;
    }
  }
</script>

<ContextMenu.Root bind:open={openContextMenu}>
  <ContextMenu.Content class="p-1" data-testid="playlist-context-content">
    <ContextMenu.Item
      onclick={handleDeleteOrUnfollow}
      data-testid="playlist-context-item"
    >
      {playlist.created_by === session?.user.id
        ? 'Delete playlist'
        : 'Unfollow playlist'}
    </ContextMenu.Item>
  </ContextMenu.Content>
  <ContextMenu.Trigger class="contents outline-hidden">
    {@render children()}
  </ContextMenu.Trigger>
</ContextMenu.Root>

<!-- Show AlertDialog for public playlist deletion -->
<PlaylistDeleteAlertDialog
  {playlist}
  {sidebarState}
  {session}
  {supabase}
  bind:open={showDeleteDialog}
/>
