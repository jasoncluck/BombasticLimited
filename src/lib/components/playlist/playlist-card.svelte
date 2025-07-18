<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import { Check, ListVideo } from "@lucide/svelte";

  const {
    playlist,
    isFollowedPlaylist = false,
  }: { playlist: Playlist; isFollowedPlaylist: boolean } = $props();
</script>

<a
  class="grid grid-cols-[4rem_1fr] p-3 gap-2 items-center hover:bg-secondary
      transform cursor-pointer rounded"
  href={`/playlist/${playlist.short_id}`}
>
  {#if playlist.processedImageUrl}
    <img
      src={playlist.processedImageUrl}
      alt={playlist.name}
      class="w-full h-full max-w-16 max-h-16 object-cover rounded justify-self-center"
    />
  {:else}
    <div class="h-12 w-12 flex items-center justify-center justify-self-center">
      <ListVideo class="!h-12 !w-12" />
    </div>
  {/if}

  <div class="min-w-0">
    <p class="text-sm font-medium mb-1">
      {playlist.name}
    </p>
    <p class="text-xs text-muted-foreground line-clamp-3">
      {playlist.description}
    </p>
    <p class="text-xs text-muted-foreground line-clamp-3">
      {playlist.description}
    </p>
    {#if isFollowedPlaylist}
      <p class="flex items-center gap-1 text-xs text-muted-foreground">
        <Check size="14" /> Following
      </p>
    {/if}
  </div>
</a>
