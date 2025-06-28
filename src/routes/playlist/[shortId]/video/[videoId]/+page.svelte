<script lang="ts">
  import { page } from "$app/state";
  import Content from "$lib/components/content/content.svelte";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let {
    video,
    videos,
    playlist,
    playlists,
    contentFilter,
    timestampStartSeconds,
    supabase,
    session,
  } = $derived(data);

  const startSeconds = $derived.by(() => {
    const startSecondsSearchParam = page.url.searchParams.get("t");
    return startSecondsSearchParam
      ? parseInt(startSecondsSearchParam)
      : timestampStartSeconds;
  });

  $effect(() => {
    console.log(startSeconds);
  });
</script>

<div class="m-4">
  <div class="mb-20">
    {#key video.id}
      <VideoPlayer
        {video}
        baseUrl={`/playlist/${playlist.short_id}`}
        videoId={video.id}
        {startSeconds}
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
