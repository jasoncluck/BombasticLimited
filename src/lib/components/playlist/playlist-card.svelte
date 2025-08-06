<script lang="ts">
  import type { Playlist } from '$lib/supabase/playlists';
  import { Check, ListVideo } from '@lucide/svelte';

  const {
    playlist,
    isFollowedPlaylist = false,
  }: { playlist: Playlist; isFollowedPlaylist: boolean } = $props();
</script>

<a
  class="hover:bg-secondary grid transform cursor-pointer grid-cols-[4rem_1fr] items-center
      gap-2 rounded p-3"
  href={`/playlist/${playlist.short_id}`}
>
  {#if playlist.processedImageUrl}
    <div class="h-16 w-16 flex-shrink-0 justify-self-center">
      <img
        src={playlist.processedImageUrl}
        alt={playlist.name}
        class="h-full w-full rounded object-cover"
        loading="lazy"
      />
    </div>
  {:else}
    <div class="flex h-16 w-16 items-center justify-center justify-self-center rounded bg-muted">
      <ListVideo class="!h-8 !w-8 text-muted-foreground" />
    </div>
  {/if}

  <div class="min-w-0">
    <p class="mb-1 text-sm font-medium">
      {playlist.name}
    </p>
    <p class="text-muted-foreground line-clamp-3 text-xs">
      {playlist.description}
    </p>
    <p class="text-muted-foreground line-clamp-3 text-xs">
      {playlist.description}
    </p>
    {#if isFollowedPlaylist}
      <p class="text-muted-foreground flex items-center gap-1 text-xs">
        <Check size="14" /> Following
      </p>
    {/if}
  </div>
</a>
