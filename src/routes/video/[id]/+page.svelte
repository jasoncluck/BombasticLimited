<script lang="ts">
  import { page } from "$app/state";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let { video, timestampStartSeconds, supabase, session } = $derived(data);

  const startSeconds = $derived.by(() => {
    const startSecondsSearchParam = page.url.searchParams.get("t");
    return startSecondsSearchParam
      ? parseInt(startSecondsSearchParam)
      : timestampStartSeconds;
  });
</script>

<div class="m-4">
  <VideoPlayer
    {video}
    videoId={page.params.id}
    {startSeconds}
    {supabase}
    {session}
  />
</div>
