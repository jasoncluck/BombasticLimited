<script lang="ts">
  import PlaylistTiles from "$lib/components/playlist/playlist-tiles.svelte";

  const { data } = $props();
  const { playlistsForUsername, followedPlaylists } = $derived(data);
</script>

<div class="flex flex-col">
  <div class="flex justify-between m-4">
    <h1 class="header-primary">Playlists</h1>
  </div>
  <PlaylistTiles playlists={playlistsForUsername} {followedPlaylists} />
</div>
