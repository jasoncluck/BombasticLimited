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
  let video: TwitchVideo | null = $state(null);
  let twitchPlayer: TwitchPlayer | null = $state(null);
  let mounted = $state(false);
  let embedElement: HTMLElement | undefined = $state();
  let playerCreated = $state(false);
  let hostname = $state('localhost');
  let adDebugInfo = $state<string[]>([]);
  let adsDetected = $state(false);
  let lastAdEvent = $state<string>('');
  let adEventCount = $state(0);

  const mediaQuery = getMediaQueryState();
  let shouldShowChat = $derived(mediaQuery.isLg);

  function addDebugInfo(message: string): void {
    if (dev) {
      console.log(`[TwitchEmbed] ${message}`);
      adDebugInfo = [
        ...adDebugInfo.slice(-15),
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
      addDebugInfo('Setting up comprehensive ad event listeners...');

      // All possible Twitch ad events
      const adEvents = [
        // Standard ad events
        'ads-ad-started',
        'ads-ad-ended',
        'ads-ad-break-started',
        'ads-ad-break-ended',
        'ads-ad-impression',
        'ads-midroll-request',
        'ads-preroll-request',
        // Additional ad events
        'ad-break-begin',
        'ad-break-end',
        'ad-impression',
        'ad-started',
        'ad-ended',
        'ad-skipped',
        'ad-click',
        'ad-error',
        'preroll-ad-started',
        'preroll-ad-ended',
        'midroll-ad-started',
        'midroll-ad-ended',
        // Amazon/IVS ad events
        'amazon-ad-started',
        'amazon-ad-ended',
        'ivs-ad-started',
        'ivs-ad-ended',
        // Player events that might indicate ads
        'play',
        'pause',
        'seeking',
        'seeked',
        'timeupdate',
        'loadstart',
        'loadedmetadata',
        'canplay',
        'playing',
        'waiting',
      ];

      // Listen on the main player object
      if (typeof player.addEventListener === 'function') {
        adEvents.forEach((eventName) => {
          player?.addEventListener?.(eventName, (event: unknown) => {
            if (eventName.includes('ad') || eventName.includes('Ad')) {
              adsDetected = true;
              lastAdEvent = eventName;
              adEventCount = adEventCount + 1;
              addDebugInfo(
                `🎯 AD EVENT: ${eventName} (Total: ${adEventCount + 1})`
              );
              if (dev && event) {
                console.log(
                  `[TwitchEmbed] Ad event data for ${eventName}:`,
                  event
                );
              }
            } else {
              addDebugInfo(`Player event: ${eventName}`);
            }
          });
        });

        // Special ready event handler
        player.addEventListener('ready', () => {
          addDebugInfo('Player ready - attempting to get video reference...');
          setTimeout(() => {
            if (typeof player?.getVideo === 'function') {
              video = player.getVideo();
              if (video) {
                addDebugInfo(
                  'Video reference obtained, setting up video-level ad listeners...'
                );
                setupVideoAdListeners();
              } else {
                addDebugInfo('Video reference is null');
              }
            } else {
              addDebugInfo('getVideo method not available');
            }
          }, 1000);
        });

        addDebugInfo(`Set up ${adEvents.length} event listeners on player`);
      }
    } catch (error) {
      addDebugInfo(
        `Error setting up ad event listeners: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  function setupVideoAdListeners(): void {
    if (!video) return;

    try {
      const videoAdEvents = [
        'ads-ad-started',
        'ads-ad-ended',
        'ads-ad-break-started',
        'ads-ad-break-ended',
        'ads-ad-impression',
        'ad-break-begin',
        'ad-break-end',
        'ad-impression',
        'ad-started',
        'ad-ended',
      ];

      if (typeof video.addEventListener === 'function') {
        videoAdEvents.forEach((eventName) => {
          video?.addEventListener?.(eventName, (event: unknown) => {
            adsDetected = true;
            lastAdEvent = `video.${eventName}`;
            adEventCount = adEventCount + 1;
            addDebugInfo(
              `🎯 VIDEO AD EVENT: ${eventName} (Total: ${adEventCount + 1})`
            );
            if (dev && event) {
              console.log(
                `[TwitchEmbed] Video ad event data for ${eventName}:`,
                event
              );
            }
          });
        });

        addDebugInfo(
          `Set up ${videoAdEvents.length} video-level ad event listeners`
        );
      }

      // Try to get the underlying player if available
      if (typeof video.getPlayer === 'function') {
        twitchPlayer = video.getPlayer();
        if (
          twitchPlayer &&
          typeof twitchPlayer.addEventListener === 'function'
        ) {
          videoAdEvents.forEach((eventName) => {
            twitchPlayer?.addEventListener?.(eventName, (event: unknown) => {
              adsDetected = true;
              lastAdEvent = `player.${eventName}`;
              adEventCount = adEventCount + 1;
              addDebugInfo(
                `🎯 PLAYER AD EVENT: ${eventName} (Total: ${adEventCount + 1})`
              );
              if (dev && event) {
                console.log(
                  `[TwitchEmbed] Player ad event data for ${eventName}:`,
                  event
                );
              }
            });
          });
          addDebugInfo('Set up player-level ad event listeners');
        }
      }
    } catch (error) {
      addDebugInfo(
        `Error setting up video ad listeners: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Monitor for ad-related network requests
  function monitorAdRequests(): void {
    if (!browser || !dev) return;

    try {
      // Override fetch to monitor ad requests
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const [resource] = args;
        let url: string;

        // Handle both string URLs and Request objects
        if (typeof resource === 'string') {
          url = resource;
        } else if (resource instanceof Request) {
          url = resource.url;
        } else if (resource instanceof URL) {
          url = resource.href;
        } else {
          url = String(resource);
        }

        if (
          url.includes('ad') ||
          url.includes('amazon-adsystem') ||
          url.includes('ads.twitch.tv')
        ) {
          addDebugInfo(`🌐 AD REQUEST: ${url}`);
        }

        return originalFetch.apply(window, args);
      };

      addDebugInfo('Network monitoring for ad requests enabled');
    } catch (error) {
      addDebugInfo(
        `Error setting up network monitoring: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function createPlayer(): Promise<void> {
    if (!mounted || !browser || !channel || playerCreated) {
      return;
    }

    try {
      addDebugInfo(`🚀 Starting player creation for channel: ${channel}`);

      // Ensure Twitch script is loaded
      await loadTwitchScript();

      // Wait a bit for the DOM to be ready
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const embedEl = document.getElementById('twitch-embed');
      if (!embedEl) {
        addDebugInfo('❌ ERROR: Twitch embed element not found');
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
        `🔧 Creating player with parent domains: ${parentDomains.join(', ')}`
      );
      if (dev) {
        addDebugInfo(
          `Player options: ${JSON.stringify(embedOptions, null, 2)}`
        );
      }

      player = new window.Twitch.Embed('twitch-embed', embedOptions);

      // Setup comprehensive event monitoring
      setupAdEventListeners();
      monitorAdRequests();

      playerCreated = true;
      addDebugInfo('✅ Twitch player created successfully');

      // Additional debugging after player creation
      setTimeout(() => {
        addDebugInfo('🔍 Post-creation diagnostics:');
        addDebugInfo(`- Player object exists: ${!!player}`);
        addDebugInfo(
          `- getVideo method available: ${!!(player && typeof player.getVideo === 'function')}`
        );

        // Check if we can access the video element
        if (player && typeof player.getVideo === 'function') {
          const videoRef = player.getVideo();
          addDebugInfo(`- Video reference obtained: ${!!videoRef}`);
        }
      }, 2000);
    } catch (error) {
      addDebugInfo(
        `❌ Error creating Twitch player: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error('Error creating Twitch player:', error);
    }
  }

  onMount(() => {
    mounted = true;
    if (browser) {
      hostname = getParentDomains()[0];
      addDebugInfo(`🏠 Component mounted on hostname: ${hostname}`);
    }

    const cleanup = mediaQuery.initialize();

    createPlayer();

    return () => {
      cleanup?.();
      if (player) {
        try {
          player.destroy();
          addDebugInfo('🧹 Player destroyed on unmount');
        } catch (error) {
          addDebugInfo(
            `❌ Error destroying player: ${error instanceof Error ? error.message : String(error)}`
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

      <!-- Ad status indicator -->
      {#if adsDetected}
        <div
          class="absolute top-2 right-2 rounded bg-green-600 px-2 py-1 text-xs text-white shadow-lg"
        >
          🎯 Ads Working! ({adEventCount} events)
        </div>
      {:else if dev}
        <div
          class="absolute top-2 right-2 rounded bg-yellow-600 px-2 py-1 text-xs text-white shadow-lg"
        >
          ⏳ Monitoring for ads...
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
    <details
      class="mt-4 rounded bg-gray-800 p-4 text-xs text-white"
      open={adsDetected}
    >
      <summary class="cursor-pointer font-bold">
        🔍 Twitch Ad Debug Console ({adDebugInfo.length} logs)
        {#if adsDetected}
          <span class="ml-2 rounded bg-green-600 px-2 py-1">ADS DETECTED!</span>
        {:else}
          <span class="ml-2 rounded bg-red-600 px-2 py-1">NO ADS YET</span>
        {/if}
      </summary>
      <div class="mt-2 max-h-60 overflow-y-auto border-t border-gray-600 pt-2">
        {#each adDebugInfo as info, index (index)}
          <div
            class="mb-1 font-mono text-xs {info.includes('AD EVENT') ||
            info.includes('AD REQUEST')
              ? 'font-bold text-green-300'
              : 'text-gray-300'}"
          >
            {info}
          </div>
        {/each}
      </div>
      <div
        class="mt-3 grid grid-cols-3 gap-4 border-t border-gray-600 pt-2 text-yellow-300"
      >
        <div>
          <strong>Ads Status:</strong>
          {adsDetected ? '✅ Detected' : '❌ None'}
        </div>
        <div>
          <strong>Event Count:</strong>
          {adEventCount}
        </div>
        <div>
          <strong>Last Event:</strong>
          {lastAdEvent || 'None'}
        </div>
      </div>
      <div class="mt-2 text-xs text-gray-400">
        <strong>💡 Troubleshooting:</strong>
        <ul class="mt-1 ml-4 list-disc">
          <li>Try a popular partnered channel (e.g., shroud, pokimane)</li>
          <li>Disable ad blockers and privacy extensions</li>
          <li>Check if you're in a supported geographic region</li>
          <li>Ads may not show for every viewer/session</li>
        </ul>
      </div>
    </details>
  {/if}
</AspectRatio>
