<script lang="ts">
  import Content from "$lib/components/content/content.svelte";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let { video, videos, playlist, playlists, contentFilter, supabase, session } =
    $derived(data);
</script>

<div class="m-4">
  <div class="mb-20">
    {#key video.id}
      <VideoPlayer
        {video}
        baseUrl={`/playlist/${playlist.short_id}`}
        videoId={video.id}
        {supabase}
        {session}
      />
    {/key}
  </div>

  {#if videos.length > 0}
    <div class="flex flex-col gap-2">
      <a class="header-link" href={`/playlist/${playlist.short_id}`}>
        Next up - {playlist.name}
      </a>
      <Content
        {videos}
        contentDisplay="CAROUSEL"
        {contentFilter}
        {playlist}
        {playlists}
        {supabase}
        {session}
      />
    </div>
  {/if}
</div>
