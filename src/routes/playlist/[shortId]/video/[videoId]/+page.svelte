<script lang="ts">
  import Content from "$lib/components/content/content.svelte";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let {
    video,
    videos,
    profilePlaylist,
    playlists,
    contentFilter,
    supabase,
    session,
  } = $derived(data);
</script>

<div class="m-4">
  <div class="mb-20">
    {#key video.id}
      <VideoPlayer
        {video}
        {contentFilter}
        baseUrl={`/playlist/${profilePlaylist.short_id}`}
        playlist={profilePlaylist}
        {supabase}
        {session}
      />
    {/key}
  </div>

  {#if videos.length > 0}
    <div class="flex flex-col gap-2">
      <a class="header-link" href={`/playlist/${profilePlaylist.short_id}`}>
        Next up - {profilePlaylist.name}
      </a>
      <Content
        {videos}
        contentDisplay="CAROUSEL"
        {contentFilter}
        playlist={profilePlaylist}
        {playlists}
        {supabase}
        {session}
      />
    </div>
  {/if}
</div>
