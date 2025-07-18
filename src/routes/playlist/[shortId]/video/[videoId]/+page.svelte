<script lang="ts">
  import Content from "$lib/components/content/content.svelte";
  import VideoPlayer from "$lib/components/video/video-player.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import { ListVideo } from "@lucide/svelte";

  const { data } = $props();
  let {
    video,
    videos,
    profilePlaylist,
    playlists,
    contentFilter,
    supabase,
    session,
    userProfile,
  } = $derived(data);
</script>

<div class="m-4">
  <div class="mb-10">
    {#key video.id}
      <VideoPlayer
        {video}
        {contentFilter}
        {playlists}
        baseUrl={`/playlist/${profilePlaylist.short_id}`}
        playlist={profilePlaylist}
        {supabase}
        {session}
      />
    {/key}
  </div>

  {#if videos.length > 0}
    <div class="flex flex-col">
      <div class="flex gap-4 items-center mb-4">
        {#if "processedImageUrl" in profilePlaylist && profilePlaylist.processedImageUrl}
          <img
            src={(profilePlaylist as Playlist).processedImageUrl}
            class="h-20 w-20"
            alt={`Image for playlist: ${profilePlaylist.name}`}
          />
        {:else}
          <ListVideo class="!h-20 !w-20" />
        {/if}
        <div class="flex flex-col">
          <p class="text-sm text-muted-foreground tracking-tight">Next up</p>
          <a
            class="header-link !m-0 !mb-2"
            href={`/playlist/${profilePlaylist.short_id}`}
          >
            {profilePlaylist.name}
          </a>
        </div>
      </div>
      <Content
        tilesDisplay="TILES"
        {videos}
        {contentFilter}
        playlist={profilePlaylist}
        {playlists}
        {userProfile}
        {supabase}
        {session}
      />
    </div>
  {/if}
</div>
