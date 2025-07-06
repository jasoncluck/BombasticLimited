<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import PlaylistCard from "./playlist-card.svelte";

  const {
    playlists,
    followedPlaylists,
  }: { playlists: Playlist[]; followedPlaylists: Playlist[] } = $props();
</script>

<div
  class="grid gap-2 m-2
  grid-cols-1
  xs:grid-cols-2
  sm:grid-cols-2 sm:gap-3 sm:m-3
  md:grid-cols-3 md:gap-4 md:m-4
  lg:grid-cols-3 lg:gap-4
  xl:grid-cols-4 xl:gap-5
  2xl:grid-cols-5"
>
  {#each playlists as playlist (playlist.id)}
    {@const isFollowedPlaylist = followedPlaylists.some(
      (p) => p.id === playlist.id,
    )}
    <PlaylistCard {playlist} {isFollowedPlaylist} />
  {/each}
</div>
