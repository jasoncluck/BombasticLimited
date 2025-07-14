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
    userProfile,
  } = $derived(data);
</script>

<div class="m-4">
  <div class="mb-20">
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
    <div class="flex flex-col gap-2">
      <a class="header-link" href={`/playlist/${profilePlaylist.short_id}`}>
        Next up - {profilePlaylist.name}
      </a>
      <Content
        tilesDisplay="CAROUSEL"
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
