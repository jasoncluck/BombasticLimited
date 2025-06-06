<script lang="ts">
  import VideoEmbed from "$lib/components/video/video-embed.svelte";
  import { onMount } from "svelte";

  const { channel } = $props();

  onMount(() => {
    const windowRef: any = window;

    if (typeof windowRef.Twitch !== "undefined") {
      const player = new windowRef.Twitch.Player("twitch-embed", {
        width: "100%",
        height: "100%",
        channel,
      });
    }
  });
</script>

<VideoEmbed divId="twitch-embed" />
