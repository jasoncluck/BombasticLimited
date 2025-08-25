<script lang="ts">
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { onMount } from 'svelte';
  import AspectRatio from '../ui/aspect-ratio/aspect-ratio.svelte';

  interface Props {
    channel: string;
  }

  const { channel }: Props = $props();

  interface TwitchEmbedPlayer {
    destroy(): void;
  }

  interface TwitchEmbedOptions {
    width: string;
    height: string;
    channel: string;
    layout: 'video' | 'video-with-chat';
    theme: 'dark';
    parent: string[];
    autoplay: boolean;
    muted: boolean;
  }

  let player: TwitchEmbedPlayer | null = $state(null);
  let mounted = $state(false);
  let embedElement: HTMLElement | undefined = $state();
  let playerCreated = $state(false);

  const mediaQuery = getMediaQueryState();
  let shouldShowChat = $derived(mediaQuery.isLg);

  async function createPlayer(): Promise<void> {
    if (
      !mounted ||
      typeof window.Twitch === 'undefined' ||
      !channel ||
      playerCreated
    ) {
      return;
    }

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const embedEl = document.getElementById('twitch-embed');
      if (!embedEl) {
        console.warn('Twitch embed element not found');
        return;
      }

      const embedOptions: TwitchEmbedOptions = {
        width: '100%',
        height: '100%',
        channel: channel,
        layout: 'video',
        theme: 'dark',
        parent: [window.location.hostname, 'localhost'],
        autoplay: false,
        muted: false,
      };

      player = new window.Twitch.Embed('twitch-embed', embedOptions);

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

<!-- Use 21:9 aspect ratio when chat is enabled, 16:9 when not -->
<AspectRatio ratio={shouldShowChat ? 21 / 9 : 16 / 9}>
  <div
    class="grid h-full w-full gap-4 transition-all duration-300 ease-in-out {shouldShowChat
      ? 'grid-cols-[1fr_320px]'
      : 'grid-cols-1'}"
  >
    <!-- Video container -->
    <div class="relative">
      <div
        id="twitch-embed"
        bind:this={embedElement}
        class="absolute inset-0 h-full w-full rounded bg-black"
      ></div>
    </div>

    <!-- Chat container - only rendered when needed -->
    {#if shouldShowChat}
      <div class="overflow-hidden rounded bg-gray-900">
        <iframe
          src="https://www.twitch.tv/embed/{channel}/chat?darkpopout&parent={window
            .location.hostname}&parent=localhost"
          class="h-full w-full border-0"
          title="Twitch Chat for {channel}"
          allow="accelerometer; gyroscope; microphone; camera;"
        ></iframe>
      </div>
    {/if}
  </div>
</AspectRatio>
