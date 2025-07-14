<script lang="ts">
  import { handleAddVideosToPlaylist } from "$lib/components/playlist/playlist-service";
  import Button from "$lib/components/ui/button/button.svelte";
  import { getDrawerState } from "$lib/state/drawer.svelte";
  import type { Database } from "$lib/supabase/database.types";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import { ListVideo } from "@lucide/svelte";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";

  const drawerState = getDrawerState();

  const {
    videos,
    playlist,
    playlists,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const filteredPlaylists = $derived(
    playlists.filter(
      (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
    ),
  );
</script>

<div>
  {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
    {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
      <Button
        class="drawer-playlist-button"
        variant="ghost"
        onclick={() => {
          handleAddVideosToPlaylist({
            videos: [videos[0]],
            playlist: addPlaylist,
            supabase,
            session,
          });
          drawerState.close();
        }}
      >
        {#if addPlaylist.processedImageUrl}
          <div class="h-12 w-12 shrink-0">
            <img
              src={addPlaylist.processedImageUrl}
              class="h-full w-full object-cover cursor-pointer"
              alt={`Image for playlist: ${addPlaylist.name}`}
            />
          </div>
        {:else}
          <div class="h-12 w-12 flex-shrink-0 flex items-center justify-center">
            <ListVideo class="!h-8 !w-8" />
          </div>
        {/if}
        <div class="flex flex-col items-start gap-1">
          <p>
            {addPlaylist.name}
          </p>
          <p class="text-muted-foreground">{addPlaylist.type}</p>
        </div>
      </Button>
    {/if}
  {/each}
</div>
