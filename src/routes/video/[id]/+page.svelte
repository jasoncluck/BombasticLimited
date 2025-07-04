<script lang="ts">
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let { video, supabase, session } = $derived(data);
</script>

<div class="m-4">
  <VideoPlayer {video} {supabase} {session} />
</div>
