<script lang="ts">
  import { getSidebarState } from "$lib/state/sidebar.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session } from "@supabase/supabase-js";
  import PlaylistCard from "./playlist-card.svelte";

  const {
    playlists,
    session,
  }: { playlists: Playlist[]; session: Session | null } = $props();

  const sidebarState = getSidebarState();
</script>

<div
  class="grid gap-2 my-2
  grid-cols-1
  @lg:grid-cols-2
  @xl:grid-cols-2 @xl:gap-3
  @2xl:grid-cols-3 @2xl:gap-3"
>
  {#each playlists as playlist (playlist.id)}
    {@const isFollowedPlaylist = sidebarState
      .getFollowedPlaylists(session)
      .some((p) => p.id === playlist.id)}
    <PlaylistCard {playlist} {isFollowedPlaylist} />
  {/each}
</div>
