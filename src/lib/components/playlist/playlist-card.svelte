<script lang="ts">
  import type { Playlist } from '$lib/supabase/playlists';
  import { Check, ListVideo } from '@lucide/svelte';
  import * as Avatar from '$lib/components/ui/avatar';
  import { isSource, SOURCE_INFO } from '$lib/constants/source';
  import PlaylistImage from './playlist-image.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';

  const {
    playlist,
    supabase,
    isFollowedPlaylist = false,
    showUsername = true,
  }: {
    playlist: Playlist & {
      avatar_url?: string | null;
      profile_username?: string;
    };
    supabase: SupabaseClient<Database>;
    isFollowedPlaylist: boolean;
    showUsername?: boolean;
  } = $props();
</script>

<a
  class="hover:bg-secondary/50 grid transform cursor-pointer grid-cols-[4rem_1fr] items-center
      gap-4 rounded p-3 hover:brightness-110"
  href={`/playlist/${playlist.short_id}`}
>
  <PlaylistImage {playlist} {supabase} size="medium" />

  <div class="min-w-0">
    <p class="mb-1 text-sm font-medium">
      {playlist.name}
    </p>
    <p
      class="text-muted-foreground line-clamp-1 max-w-48 text-xs text-wrap break-words"
    >
      {playlist.description}
    </p>

    <!-- Avatar and username display -->
    {#if showUsername}
      {#if isSource(playlist.profile_username)}
        <div class=" flex items-center gap-2">
          <Avatar.Root class="h-6 w-6">
            <Avatar.Image
              src={SOURCE_INFO[playlist.profile_username].image.img.src}
              alt={`Profile picture for user: ${SOURCE_INFO[playlist.profile_username].displayName}`}
            />
          </Avatar.Root>
          <p class="text-muted-foreground text-xs">
            {SOURCE_INFO[playlist.profile_username].displayName}
          </p>
        </div>
      {:else if playlist.profile_username}
        <div class="mt-2 flex items-center gap-2">
          <Avatar.Root class="h-6 w-6">
            <Avatar.Image
              src={playlist.avatar_url}
              alt="Profile picture for user: {playlist.profile_username}"
            />
            <Avatar.Fallback class="text-xs">
              {playlist.profile_username.slice(0, 2).toUpperCase()}
            </Avatar.Fallback>
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
