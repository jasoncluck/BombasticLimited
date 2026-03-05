<script lang="ts">
  import type { Playlist } from '$lib/supabase/playlists';
  import { Check, ListVideo } from '@lucide/svelte';
  import * as Avatar from '$lib/components/ui/avatar';
  import { isSource, SOURCE_INFO } from '$lib/constants/source';
  import { getUserInitials } from '../profile/profile-service';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  const {
    playlist,
    isFollowedPlaylist = false,
    showUsername = true,
  }: {
    playlist: Playlist;
    isFollowedPlaylist: boolean;
    showUsername?: boolean;
  } = $props();

  const mediaQueryState = getMediaQueryState();
</script>

<a
  class="hover:bg-secondary/50 grid transform cursor-pointer grid-cols-[4rem_1fr] items-center
      gap-4 rounded hover:brightness-110 {mediaQueryState.canHover
    ? 'p-3'
    : ''}"
  href={`/playlist/${playlist.short_id}`}
>
  {#if playlist.image_url}
    <div class="h-16 w-16 flex-shrink-0 justify-self-center">
      <img
        src={playlist.image_url}
        alt={playlist.name}
        class="h-full w-full rounded object-cover"
        loading="eager"
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
    <p class="text-sm font-medium">
      {playlist.name}
    </p>
    <p
      class="text-muted-foreground mb-2 line-clamp-1 max-w-48 text-xs text-wrap break-words"
    >
      {playlist.description}
    </p>

    <!-- Avatar and username display -->
    {#if showUsername}
      {#if isSource(playlist.profile_username)}
        {@const sourceInfo = SOURCE_INFO[playlist.profile_username]}
        <div class=" flex items-center gap-2">
          <Avatar.Root class="h-6 w-6">
            <Avatar.Image
              src={sourceInfo.image.img.src}
              alt={`${sourceInfo.displayName} playlist`}
            />
          </Avatar.Root>
          <p class="text-muted-foreground text-xs">
            {sourceInfo.displayName}
          </p>
        </div>
      {:else if playlist.profile_username}
        <div class="flex items-center gap-2">
          <Avatar.Root class="h-6 w-6">
            <Avatar.Image
              src={playlist.profile_avatar_url}
              alt="Profile picture for user: {playlist.profile_username}"
            />
            <Avatar.Fallback class="text-xs">
              {getUserInitials(playlist.profile_username)}</Avatar.Fallback
            >
          </Avatar.Root>
          <p class="text-muted-foreground text-xs">
            {playlist.profile_username}
          </p>
        </div>
      {/if}
    {/if}

    {#if isFollowedPlaylist}
      <p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
        <Check size="14" /> Following
      </p>
    {/if}
  </div>
</a>
