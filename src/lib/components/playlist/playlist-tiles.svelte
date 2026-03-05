<script lang="ts">
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import PlaylistCard from './playlist-card.svelte';

  const {
    playlists,
    showUsername = true,
    session,
  }: {
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    showUsername?: boolean;
    session: Session | null;
  } = $props();

  const sidebarState = getSidebarState();
</script>

<div
  class="my-2 grid grid-cols-1
  gap-2
  @lg:grid-cols-2
  @xl:grid-cols-2 @xl:gap-3
  @2xl:grid-cols-3 @2xl:gap-3"
>
  {#each playlists as playlist (playlist.id)}
    {@const isFollowedPlaylist = sidebarState
      .getFollowedPlaylists(session)
      .some((p) => p.id === playlist.id)}
    <PlaylistCard {playlist} {isFollowedPlaylist} {showUsername} />
  {/each}
</div>
