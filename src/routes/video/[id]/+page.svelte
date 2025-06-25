<script lang="ts">
  import { page } from "$app/state";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let { video, startSeconds, supabase, session } = $derived(data);
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
