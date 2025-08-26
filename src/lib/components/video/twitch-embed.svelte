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
    addEventListener?(event: string, callback: () => void): void;
    removeEventListener?(event: string, callback: () => void): void;
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
  let hostname = $state('localhost');
  let adDebugInfo = $state<string[]>([]);

  const mediaQuery = getMediaQueryState();
  let shouldShowChat = $derived(mediaQuery.isLg);

  function addDebugInfo(message: string): void {
    console.log(`[TwitchEmbed] ${message}`);
    adDebugInfo = [
      ...adDebugInfo,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ];
  }

  async function loadTwitchScript(): Promise<void> {
    if (typeof window.Twitch !== 'undefined') {
      addDebugInfo('Twitch script already loaded');
      return;
    }

    addDebugInfo('Loading Twitch embed script...');
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://embed.twitch.tv/embed/v1.js';
      script.async = true;
      script.onload = () => {
        addDebugInfo('Twitch script loaded successfully');
        resolve();
      };
      script.onerror = () => {
        addDebugInfo('Failed to load Twitch embed script');
        reject(new Error('Failed to load Twitch embed script'));
      };
      document.head.appendChild(script);
    });
  }

  async function createPlayer(): Promise<void> {
    if (!mounted || !browser || !channel || playerCreated) {
      return;
    }

    try {
      addDebugInfo(`Starting player creation for channel: ${channel}`);

      // Ensure Twitch script is loaded
      await loadTwitchScript();

      // Wait a bit for the DOM to be ready
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const embedEl = document.getElementById('twitch-embed');
      if (!embedEl) {
        addDebugInfo('ERROR: Twitch embed element not found');
        return;
      }

      // Get the current hostname
      const currentHostname = window.location.hostname;
      hostname = currentHostname;

      const embedOptions: TwitchEmbedOptions = {
        width: '100%',
        height: '100%',
        channel: channel,
        layout: 'video',
        theme: 'dark',
        parent: [currentHostname, 'localhost'],
        autoplay: false,
        muted: false,
      };

      addDebugInfo(
        `Creating player with parent domains: ${embedOptions.parent.join(', ')}`
      );
      addDebugInfo(`Player options: ${JSON.stringify(embedOptions, null, 2)}`);

      player = new window.Twitch.Embed('twitch-embed', embedOptions);

      // Add event listeners if available
      if (player && typeof player.addEventListener === 'function') {
        player.addEventListener('ready', () => {
          addDebugInfo('Player ready event fired');
        });
      }

      playerCreated = true;
      addDebugInfo('Twitch player created successfully');

      // Additional debugging for ad-related events
      setTimeout(() => {
        addDebugInfo('Checking for ad-related errors in console...');
        if (window.console && window.console.error) {
          const originalError = window.console.error;
          window.console.error = function (...args: unknown[]) {
            const message = args.join(' ');
            if (
              message.includes('ad') ||
              message.includes('Ad') ||
              message.includes('advertisement')
            ) {
              addDebugInfo(`Ad-related error detected: ${message}`);
            }
            originalError.apply(console, args);
          };
        }
      }, 1000);
    } catch (error) {
      addDebugInfo(
        `Error creating Twitch player: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error('Error creating Twitch player:', error);
    }
  }

  onMount(() => {
    mounted = true;
    if (browser) {
      hostname = window.location.hostname;
      addDebugInfo(`Component mounted on hostname: ${hostname}`);
    }

    const cleanup = mediaQuery.initialize();

    createPlayer();

    return () => {
      cleanup?.();
      if (player) {
        try {
          player.destroy();
          addDebugInfo('Player destroyed on unmount');
        } catch (error) {
          addDebugInfo(
            `Error destroying player: ${error instanceof Error ? error.message : String(error)}`
          );
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
          src="https://www.twitch.tv/embed/{channel}/chat?darkpopout&parent={hostname}&parent=localhost"
          class="h-full w-full border-0"
          title="Twitch Chat for {channel}"
          allow="microphone; camera;"
        ></iframe>
      </div>
    {/if}
  </div>

  <!-- Debug information panel (only shown in development) -->
  {#if browser && window.location.hostname === 'localhost'}
    <div class="mt-4 rounded bg-gray-800 p-4 text-xs text-white">
      <h3 class="mb-2 font-bold">Twitch Embed Debug Info:</h3>
      <div class="max-h-40 overflow-y-auto">
        {#each adDebugInfo as info}
          <div class="mb-1">{info}</div>
        {/each}
      </div>
      <div class="mt-2 text-yellow-300">
        <strong>Note:</strong> Twitch ads may not appear on localhost or for all
        channels/regions. Try testing on a deployed version with a popular, monetized
        channel.
      </div>
    </div>
  {/if}
</AspectRatio>
