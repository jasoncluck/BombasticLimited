<script lang="ts">
  import { page } from "$app/state";
  import VideoPlayer from "$lib/components/video/video-player.svelte";

  const { data } = $props();
  let { video, supabase, session } = $derived(data);
</script>

<div class="m-4">
  <VideoPlayer {video} videoId={page.params.id} {supabase} {session} />
</div>
