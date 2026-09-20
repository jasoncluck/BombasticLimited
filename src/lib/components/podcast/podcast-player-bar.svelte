<script lang="ts">
  import { Play, Pause, SkipBack, SkipForward, X } from '@lucide/svelte';
  import { getPodcastPlayerState } from '$lib/state/podcast-player.svelte';
  import { SOURCE_INFO } from '$lib/constants/source';
  import Button from '../ui/button/button.svelte';
  import Slider from '../ui/slider/slider.svelte';
  import {
    formatEpisodeDuration,
    formatEpisodePublishedDate,
  } from './podcast-service';

  const playerState = getPodcastPlayerState();

  let audioEl: HTMLAudioElement | undefined = $state();

  // A seek originating from our own ontimeupdate handler always matches
  // audioEl.currentTime exactly (diff ~0); a genuine external seek (the
  // progress slider, skip buttons, another tile's play click) won't. This
  // keeps the effect below from fighting normal playback progress.
  const SEEK_THRESHOLD_SECONDS = 0.75;

  $effect(() => {
    const episode = playerState.currentEpisode;
    if (!audioEl || !episode) return;

    if (audioEl.src !== episode.audio_url) {
      audioEl.src = episode.audio_url;
      audioEl.load();
    }
  });

  $effect(() => {
    if (!audioEl || !playerState.currentEpisode) return;

    if (playerState.isPlaying && audioEl.paused) {
      audioEl.play().catch((error) => {
        console.error('Podcast playback failed:', error);
        playerState.isPlaying = false;
      });
    } else if (!playerState.isPlaying && !audioEl.paused) {
      audioEl.pause();
    }
  });

  $effect(() => {
    if (!audioEl) return;
    const target = playerState.currentTime;
    if (Math.abs(audioEl.currentTime - target) > SEEK_THRESHOLD_SECONDS) {
      audioEl.currentTime = target;
    }
  });

  $effect(() => {
    if (!audioEl) return;
    audioEl.volume = playerState.volume;
  });

  // OS-level media controls (lock screen, headphone/hardware media keys).
  $effect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const episode = playerState.currentEpisode;
    if (!episode) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: SOURCE_INFO[episode.source].displayName,
      artwork: episode.image_url
        ? [{ src: episode.image_url, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
    navigator.mediaSession.playbackState = playerState.isPlaying
      ? 'playing'
      : 'paused';
    navigator.mediaSession.setActionHandler('play', () =>
      playerState.togglePlayPause()
    );
    navigator.mediaSession.setActionHandler('pause', () =>
      playerState.togglePlayPause()
    );
    navigator.mediaSession.setActionHandler('seekbackward', () =>
      playerState.skip(-15)
    );
    navigator.mediaSession.setActionHandler('seekforward', () =>
      playerState.skip(15)
    );
  });

  function handleTimeUpdate(): void {
    if (!audioEl) return;
    playerState.currentTime = audioEl.currentTime;
  }

  function handleLoadedMetadata(): void {
    if (!audioEl) return;
    playerState.duration = audioEl.duration;
  }

  function handlePlay(): void {
    playerState.isPlaying = true;
  }

  function handlePause(): void {
    playerState.isPlaying = false;
  }

  function handleEnded(): void {
    playerState.isPlaying = false;
    playerState.currentTime = 0;
  }
</script>

<!-- Single global <audio> element — always mounted, controlled entirely via
     playerState so it survives client-side navigation between pages. -->
<audio
  bind:this={audioEl}
  ontimeupdate={handleTimeUpdate}
  onloadedmetadata={handleLoadedMetadata}
  onplay={handlePlay}
  onpause={handlePause}
  onended={handleEnded}
  preload="metadata"
></audio>

{#if playerState.currentEpisode}
  {@const episode = playerState.currentEpisode}
  <div
    class="bg-background fixed right-0 bottom-0 left-0 z-50 border-t shadow-lg"
    data-testid="podcast-player-bar"
  >
    <div class="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        {#if episode.image_url}
          <img
            src={episode.image_url}
            alt={episode.title}
            class="h-10 w-10 shrink-0 rounded object-cover sm:h-12 sm:w-12"
          />
        {:else}
          <div
            class="bg-secondary h-10 w-10 shrink-0 rounded sm:h-12 sm:w-12"
          ></div>
        {/if}
        <div class="min-w-0">
          <p class="truncate text-sm font-medium" title={episode.title}>
            {episode.title}
          </p>
          <p class="text-muted-foreground truncate text-xs">
            {SOURCE_INFO[episode.source].displayName} · {formatEpisodePublishedDate(
              episode.published_at
            )}
          </p>
        </div>
      </div>

      <div class="flex flex-1 flex-col items-center gap-1">
        <div class="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="hidden cursor-pointer sm:inline-flex"
            title="Back 15 seconds"
            onclick={() => playerState.skip(-15)}
          >
            <SkipBack size={18} />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            class="cursor-pointer rounded-full"
            title={playerState.isPlaying ? 'Pause' : 'Play'}
            onclick={() => playerState.togglePlayPause()}
          >
            {#if playerState.isPlaying}
              <Pause size={18} />
            {:else}
              <Play size={18} />
            {/if}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="hidden cursor-pointer sm:inline-flex"
            title="Forward 15 seconds"
            onclick={() => playerState.skip(15)}
          >
            <SkipForward size={18} />
          </Button>
        </div>
        <div class="hidden w-full max-w-md items-center gap-2 sm:flex">
          <span class="text-muted-foreground w-10 text-right text-xs">
            {formatEpisodeDuration(playerState.currentTime)}
          </span>
          <Slider
            type="single"
            bind:value={playerState.currentTime}
            max={playerState.duration || 1}
            step={1}
            class="flex-1"
          />
          <span class="text-muted-foreground w-10 text-xs">
            {formatEpisodeDuration(playerState.duration)}
          </span>
        </div>
      </div>

      <div class="flex flex-1 justify-end">
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer"
          title="Close player"
          onclick={() => playerState.close()}
        >
          <X size={18} />
        </Button>
      </div>
    </div>
  </div>
{/if}
