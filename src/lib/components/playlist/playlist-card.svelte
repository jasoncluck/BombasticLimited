<script lang="ts">
  import type { Playlist } from '$lib/supabase/playlists';
  import { Check, ListVideo } from '@lucide/svelte';
  import * as Avatar from '$lib/components/ui/avatar';

  const {
    playlist,
    isFollowedPlaylist = false,
  }: {
    playlist: Playlist & {
      avatar_url?: string | null;
      profile_username?: string;
    };
    isFollowedPlaylist: boolean;
  } = $props();
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
    <div
      class="bg-muted flex h-16 w-16 items-center justify-center justify-self-center rounded"
    >
      <ListVideo class="text-muted-foreground !h-8 !w-8" />
    </div>
  {/if}

  <div class="min-w-0">
    <p class="mb-1 text-sm font-medium">
      {playlist.name}
    </p>
    <p class="text-muted-foreground line-clamp-3 text-xs">
      {playlist.description}
    </p>

    <!-- Avatar and username display -->
    {#if playlist.profile_username}
      <div class="mt-2 flex items-center gap-2">
        <Avatar.Root class="h-4 w-4">
          <Avatar.Image
            src={playlist.avatar_url}
            alt="{playlist.profile_username} avatar"
          />
          <Avatar.Fallback class="text-xs">
            {playlist.profile_username.slice(0, 2).toUpperCase()}
          </Avatar.Fallback>
        </Avatar.Root>
        <p class="text-muted-foreground text-xs">{playlist.profile_username}</p>
      </div>
    {/if}

    {#if isFollowedPlaylist}
      <p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
        <Check size="14" /> Following
      </p>
    {/if}
  </div>
</a>
