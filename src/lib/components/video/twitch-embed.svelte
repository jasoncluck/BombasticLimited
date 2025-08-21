<script lang="ts">
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { onMount } from 'svelte';
  import AspectRatio from '../ui/aspect-ratio/aspect-ratio.svelte';

  interface Props {
    channel: string;
  }

  const { channel }: Props = $props();

  let player: any = $state(null);
  let mounted = $state(false);
  let embedElement: HTMLElement | undefined = $state();
  let playerCreated = $state(false);

  const mediaQuery = getMediaQueryState();
  // let shouldShowChat = $derived(mediaQuery.isLg);

  async function createPlayer() {
    const windowRef: any = window;

    if (
      !mounted ||
      typeof windowRef.Twitch === 'undefined' ||
      !channel ||
      playerCreated
    ) {
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const embedEl = document.getElementById('twitch-embed');
      if (!embedEl) {
        console.warn('Twitch embed element not found');
        return;
      }

      player = new windowRef.Twitch.Embed('twitch-embed', {
        width: '100%',
        height: '100%',
        channel: channel,
        layout: 'video',
        theme: 'dark',
        parent: [window.location.hostname, 'localhost'],
        autoplay: false,
        muted: false,
      });

      playerCreated = true;
      console.log('Twitch player created successfully');
    } catch (error) {
      console.error('Error creating Twitch player:', error);
    }
  }

  onMount(() => {
    mounted = true;
    const cleanup = mediaQuery.initialize();

    createPlayer();

    return () => {
      cleanup?.();
      if (player) {
        try {
          player.destroy();
        } catch (error) {
          console.warn('Error destroying Twitch player on unmount:', error);
        }
      }
    };
  });
</script>

<AspectRatio ratio={16 / 9}>
  <div class="grid h-full w-full gap-4 transition-all duration-300 ease-in-out">
    <!-- Video container -->
    <div class="relative">
      <div
        id="twitch-embed"
        bind:this={embedElement}
        class="absolute inset-0 h-full w-full rounded bg-black"
      ></div>
    </div>
  </div>
</AspectRatio>
