<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import PlaylistCard from "./playlist-card.svelte";

  const {
    playlists,
    followedPlaylists,
  }: { playlists: Playlist[]; followedPlaylists: Playlist[] } = $props();
</script>

<div
  class="grid gap-2 my-2
  grid-cols-1
  @lg:grid-cols-2
  @xl:grid-cols-2 @xl:gap-3
  @2xl:grid-cols-3 @2xl:gap-3"
>
  {#each playlists as playlist (playlist.id)}
    {@const isFollowedPlaylist = followedPlaylists.some(
      (p) => p.id === playlist.id,
    )}
    <PlaylistCard {playlist} {isFollowedPlaylist} />
  {/each}
</div>
