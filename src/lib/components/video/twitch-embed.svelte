<script lang="ts">
  import VideoEmbed from "$lib/components/video/video-embed.svelte";
  import { onMount } from "svelte";
  import AspectRatio from "../ui/aspect-ratio/aspect-ratio.svelte";

  const { channel } = $props();

  let player: any = null;
  let mounted = false;

  function createOrUpdatePlayer() {
    const windowRef: any = window;

    if (!mounted || typeof windowRef.Twitch === "undefined") {
      return;
    }

    // If player exists, destroy it first
    if (player) {
      try {
        player.destroy();
      } catch (error) {
        console.warn("Error destroying Twitch player:", error);
      }
      player = null;
    }

    // Create new player with updated channel
    if (channel) {
      player = new windowRef.Twitch.Player("twitch-embed", {
        width: "100%",
        height: "100%",
        channel,
      });
    }
  }

  onMount(() => {
    mounted = true;
    createOrUpdatePlayer();

    return () => {
      // Cleanup on unmount
      if (player) {
        try {
          player.destroy();
        } catch (error) {
          console.warn("Error destroying Twitch player on unmount:", error);
        }
      }
    };
  });

  // React to channel changes
  $effect(() => {
    createOrUpdatePlayer();
  });
</script>

<AspectRatio ratio={16 / 9}>
  <VideoEmbed divId="twitch-embed" />
</AspectRatio>
