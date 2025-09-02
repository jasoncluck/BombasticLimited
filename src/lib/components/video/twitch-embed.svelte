<script lang="ts">
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import AspectRatio from '../ui/aspect-ratio/aspect-ratio.svelte';

  interface Props {
    channel: string;
  }

  const { channel }: Props = $props();

  interface TwitchEmbedPlayer {
    destroy(): void;
    addEventListener?(event: string, callback: (event?: unknown) => void): void;
    removeEventListener?(
      event: string,
      callback: (event?: unknown) => void
    ): void;
    getVideo?(): TwitchVideo | null;
    setVolume?(volume: number): void;
    getVolume?(): number;
    play?(): void;
    pause?(): void;
  }

  interface TwitchVideo {
    addEventListener?(event: string, callback: (event?: unknown) => void): void;
    removeEventListener?(
      event: string,
      callback: (event?: unknown) => void
    ): void;
    getPlayer?(): TwitchPlayer | null;
  }

  interface TwitchPlayer {
    addEventListener?(event: string, callback: (event?: unknown) => void): void;
    removeEventListener?(
      event: string,
      callback: (event?: unknown) => void
    ): void;
  }

  interface TwitchEmbedOptions {
    width: string;
    height: string;
    channel: string;
    layout: 'video' | 'video-with-chat';
    theme: 'dark' | 'light';
    parent: string[];
    autoplay: boolean;
    muted: boolean;
  }

  let player: TwitchEmbedPlayer | null = $state(null);
  let mounted = $state(false);
  let embedElement: HTMLElement | undefined = $state();
  let playerCreated = $state(false);
  let hostname = $state('localhost');

  const mediaQuery = getMediaQueryState();
  let shouldShowChat = $derived(mediaQuery.isLg);

  function getParentDomains(): string[] {
    if (!browser) return ['localhost'];

    const currentHostname = window.location.hostname;
    const domains: string[] = [currentHostname, `www.${currentHostname}`];

    // Only add localhost if we're actually running on localhost
    if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
      domains.push('localhost');
    }

    // Remove duplicates
    return [...new Set(domains)];
  }

  async function loadTwitchScript(): Promise<void> {
    if (typeof window.Twitch !== 'undefined') {
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://embed.twitch.tv/embed/v1.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('Failed to load Twitch embed script'));
      document.head.appendChild(script);
    });
  }

  async function createPlayer(): Promise<void> {
    if (!mounted || !browser || !channel || playerCreated) {
      return;
    }

    try {
      // Ensure Twitch script is loaded
      await loadTwitchScript();

      // Wait a bit for the DOM to be ready
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const embedEl = document.getElementById('twitch-embed');
      if (!embedEl) {
        console.error('Twitch embed element not found');
        return;
      }

      // Get parent domains
      const parentDomains = getParentDomains();
      hostname = parentDomains[0];

      const embedOptions: TwitchEmbedOptions = {
        width: '100%',
        height: '100%',
        channel: channel,
        layout: 'video',
        theme: 'dark',
        parent: parentDomains,
        autoplay: false,
        muted: false,
      };

      player = new window.Twitch.Embed('twitch-embed', embedOptions);
      playerCreated = true;
    } catch (error) {
      console.error('Error creating Twitch player:', error);
    }
  }

  onMount(() => {
    mounted = true;
    if (browser) {
      hostname = getParentDomains()[0];
    }

    const cleanup = mediaQuery.initialize();

    createPlayer();

    return () => {
      cleanup?.();
      if (player) {
        try {
          player.destroy();
        } catch (error) {
          console.error('Error destroying player:', error);
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
          src="https://www.twitch.tv/embed/{channel}/chat?darkpopout&parent={hostname}"
          class="h-full w-full border-0"
          title="Twitch Chat for {channel}"
          allow="microphone; camera;"
        ></iframe>
      </div>
    {/if}
  </div>
</AspectRatio>
