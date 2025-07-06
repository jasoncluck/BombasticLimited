<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import PlaylistCard from "./playlist-card.svelte";

  const { playlists }: { playlists: Playlist[] } = $props();
</script>

<div class="grid grid-cols-3 gap-2 m-4">
  {#each playlists as playlist (playlist.id)}
    <PlaylistCard {playlist} />
  {/each}
</div>
