<script lang="ts">
  import VideoPlayer from '$lib/components/video/video-player.svelte';

  const { data } = $props();
  let { video, contentFilter, neon, session } = $derived(data);
</script>

<div class="mx-auto w-full max-w-[1100px]">
  <VideoPlayer {video} {contentFilter} {neon} {session} />
</div>
