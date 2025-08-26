<script lang="ts">
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { dev } from '$app/environment';
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
  let video: TwitchVideo | null = $state(null);
  let mounted = $state(false);
  let embedElement: HTMLElement | undefined = $state();
  let playerCreated = $state(false);
  let hostname = $state('localhost');
  let adDebugInfo = $state<string[]>([]);
  let adsDetected = $state(false);
  let lastAdEvent = $state<string>('');

  const mediaQuery = getMediaQueryState();
  let shouldShowChat = $derived(mediaQuery.isLg);

  function addDebugInfo(message: string): void {
    if (dev) {
      console.log(`[TwitchEmbed] ${message}`);
      adDebugInfo = [
        ...adDebugInfo.slice(-10),
        `${new Date().toLocaleTimeString()}: ${message}`,
      ];
    }
  }

  function getParentDomains(): string[] {
    if (!browser) return ['localhost'];

    const currentHostname = window.location.hostname;
    const domains: string[] = [currentHostname];

    // Only add localhost if we're actually running on localhost
    if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
      domains.push('localhost');
    }

    // Remove duplicates
    return [...new Set(domains)];
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

  function setupAdEventListeners(): void {
    if (!player) return;

    try {
      // Listen for video events which might include ad events
      if (typeof player.getVideo === 'function') {
        video = player.getVideo();
        if (video && typeof video.addEventListener === 'function') {
          const adEvents = [
            'ads-ad-started',
            'ads-ad-ended',
            'ads-ad-break-started',
            'ads-ad-break-ended',
            'ads-ad-impression',
            'ads-midroll-request',
            'ads-preroll-request',
          ];

          adEvents.forEach((eventName) => {
            video?.addEventListener?.(eventName, (event: unknown) => {
              adsDetected = true;
              lastAdEvent = eventName;
              addDebugInfo(`Ad event detected: ${eventName}`);
              if (dev && event) {
                console.log(`[TwitchEmbed] Ad event data:`, event);
              }
            });
          });

          addDebugInfo('Ad event listeners setup complete');
        }
      }

      // Listen for player-level events
      if (typeof player.addEventListener === 'function') {
        player.addEventListener('ready', () => {
          addDebugInfo('Player ready event fired');
          // Try to get video reference after player is ready
          setTimeout(() => {
            if (typeof player?.getVideo === 'function') {
              video = player.getVideo();
              addDebugInfo('Video reference obtained');
            }
          }, 1000);
        });

        player.addEventListener('offline', () => {
          addDebugInfo('Channel is offline');
        });

        player.addEventListener('online', () => {
          addDebugInfo('Channel is online');
        });
      }
    } catch (error) {
      addDebugInfo(
        `Error setting up ad event listeners: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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

      addDebugInfo(
        `Creating player with parent domains: ${parentDomains.join(', ')}`
      );
      if (dev) {
        addDebugInfo(
          `Player options: ${JSON.stringify(embedOptions, null, 2)}`
        );
      }

      player = new window.Twitch.Embed('twitch-embed', embedOptions);

      // Setup event listeners
      setupAdEventListeners();

      playerCreated = true;
      addDebugInfo('Twitch player created successfully');
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
      hostname = getParentDomains()[0];
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

      <!-- Ad status indicator (only in development) -->
      {#if dev && adsDetected}
        <div
          class="absolute top-2 right-2 rounded bg-green-600 px-2 py-1 text-xs text-white"
        >
          Ads Working! Last: {lastAdEvent}
        </div>
      {/if}
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

  <!-- Debug information panel (only shown in development) -->
  {#if dev && adDebugInfo.length > 0}
    <details class="mt-4 rounded bg-gray-800 p-4 text-xs text-white">
      <summary class="cursor-pointer font-bold"
        >Twitch Embed Debug Info ({adDebugInfo.length})</summary
      >
      <div class="mt-2 max-h-40 overflow-y-auto">
        {#each adDebugInfo as info}
          <div class="mb-1 font-mono">{info}</div>
        {/each}
      </div>
      <div class="mt-2 grid grid-cols-2 gap-4 text-yellow-300">
        <div>
          <strong>Ads Detected:</strong>
          {adsDetected ? '✅ Yes' : '❌ No'}
        </div>
        <div>
          <strong>Last Ad Event:</strong>
          {lastAdEvent || 'None'}
        </div>
      </div>
      <div class="mt-2 text-gray-400">
        <strong>Note:</strong> Ad availability depends on channel monetization, geographic
        location, and viewer authentication status.
      </div>
    </details>
  {/if}
</AspectRatio>
