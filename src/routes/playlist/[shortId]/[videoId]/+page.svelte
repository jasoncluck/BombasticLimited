<script lang="ts">
  import Content from "$lib/components/content/content.svelte";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let {
    video,
    videos,
    playlist,
    playlists,
    contentFilter,
    startSeconds,
    supabase,
    session,
  } = $derived(data);
</script>

<div class="mb-20">
  <VideoPlayer
    {video}
    baseUrl={`/playlist/${playlist.short_id}`}
    videoId={video.id}
    {startSeconds}
    {supabase}
    {session}
  />
</div>

{#if videos.length > 0}
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
{/if}
