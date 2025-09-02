<script lang="ts">
  import Content from '$lib/components/content/content.svelte';
  import VideoPlayer from '$lib/components/video/video-player.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import { ListVideo } from '@lucide/svelte';

  const { data } = $props();
  let {
    video,
    videos,
    playlist,
    contentFilter,
    supabase,
    session,
    userProfile,
  } = $derived(data);
</script>

<div>
  <div class="mb-10">
    {#key video.id}
      <VideoPlayer
        {video}
        {contentFilter}
        baseUrl={`/playlist/${playlist.short_id}`}
        {playlist}
        {supabase}
        {session}
      />
    {/key}
  </div>

  {#if videos.length > 0}
    <div class="flex flex-col">
      <div class="mb-4 flex items-center gap-4">
        {#if playlist.image_url}
          <img
            src={playlist.image_url}
            class="h-20 w-20 flex-shrink-0"
            alt={`Image for playlist: ${playlist.name}`}
          />
        {:else}
          <ListVideo class="!h-20 !w-20 flex-shrink-0" />
        {/if}
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <p class="text-muted-foreground text-sm tracking-tight">Next on</p>
          <a
            class="cursor-pointer self-start text-3xl font-semibold hover:underline lg:text-4xl"
            href={`/playlist/${playlist.short_id}`}
          >
            {playlist.name}
          </a>
        </div>
      </div>
      <Content
        tilesDisplay="TILES"
        {videos}
        {contentFilter}
        {playlist}
        {userProfile}
        {supabase}
        {session}
      />
    </div>
  {/if}
</div>
