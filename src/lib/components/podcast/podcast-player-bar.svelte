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

  // Which episode's audio is currently loaded into audioEl, tracked by id
  // rather than comparing audioEl.src to episode.audio_url — the browser
  // normalizes the src it reports back (encoding, resolving relative to
  // absolute, etc.), so that comparison could spuriously mismatch and
  // re-trigger .load() on every reactive pass, which aborts playback and
  // reads as the play/pause button flickering.
  let loadedEpisodeId: number | null = $state(null);

  // A seek originating from our own ontimeupdate handler always matches
  // audioEl.currentTime exactly (diff ~0); a genuine external seek (the
  // progress slider, skip buttons, another tile's play click) won't. This
  // keeps the effect below from fighting normal playback progress.
  const SEEK_THRESHOLD_SECONDS = 0.75;

  // Local scrub position for each slider, decoupled from the real
  // playback time while the user is actively dragging. Without this, the
  // slider's bound value gets fought over: podcast currentTime is
  // rewritten by ontimeupdate every ~250ms, and video currentTime by the
  // 1s polling interval in youtube-embed.svelte, so a drag gesture keeps
  // snapping back to the real (pre-seek) position instead of tracking the
  // pointer. Real position only flows into these while NOT dragging;
  // dragging only flows out, on release, via onValueCommit.
  let podcastScrubTime = $state(0);
  let isScrubbingPodcast = $state(false);
  let videoScrubTime = $state(0);
  let isScrubbingVideo = $state(false);

  $effect(() => {
    if (!isScrubbingPodcast) {
      podcastScrubTime = playerState.currentTime;
    }
  });

  $effect(() => {
    if (!isScrubbingVideo) {
      videoScrubTime = playerState.nowPlayingVideo?.currentTime ?? 0;
    }
  });

  // Loads the current episode (if it changed) and syncs play/pause — kept
  // as ONE effect so switching episodes while playing loads the new src and
  // issues play() in the same synchronous pass, rather than splitting that
  // across two effects that could race: .load() resets audioEl.paused to
  // true synchronously, so calling play() right after in the same effect
  // sees fresh state instead of waiting on a native 'pause' event (fired by
  // the interrupted old audio) to bounce through a second effect first.
  $effect(() => {
    if (!audioEl) return;
    const episode = playerState.currentEpisode;

    if (!episode) {
      if (loadedEpisodeId !== null) {
        audioEl.removeAttribute('src');
        audioEl.load();
        loadedEpisodeId = null;
      }
      return;
    }

    if (loadedEpisodeId !== episode.id) {
      loadedEpisodeId = episode.id;
      audioEl.src = episode.audio_url;
      audioEl.load();
    }

    if (playerState.isPlaying && audioEl.paused) {
      audioEl.play().catch((error) => {
        // A .load() call (e.g. switching episodes again) aborts any
        // in-flight play() promise — expected, not a real failure.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
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

  // Global playback shortcuts, shared between podcasts and video (matches
  // YouTube's own j/k/l convention, which used to come from YouTube's
  // native controls — now hidden in favor of this bar): j/l seek ±10s,
  // k toggles play/pause. h is intentionally unmapped.
  function handleGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTypingTarget =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable;

    if (
      isTypingTarget ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      (playerState.activeMedia !== 'video' && !playerState.currentEpisode)
    ) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'j':
        event.preventDefault();
        if (playerState.activeMedia === 'video') {
          playerState.skipVideo(-10);
        } else {
          playerState.skip(-10);
        }
        break;
      case 'l':
        event.preventDefault();
        if (playerState.activeMedia === 'video') {
          playerState.skipVideo(10);
        } else {
          playerState.skip(10);
        }
        break;
      case 'k':
        event.preventDefault();
        if (playerState.activeMedia === 'video') {
          playerState.toggleVideoPlayPause();
        } else {
          playerState.togglePlayPause();
        }
        break;
      default:
        break;
    }
  }

  $effect(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
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

{#if playerState.activeMedia === 'video' && playerState.nowPlayingVideo}
  {@const video = playerState.nowPlayingVideo}
  <div
    class="bg-background fixed right-0 bottom-0 left-0 z-50 border-t shadow-lg"
    data-testid="video-player-bar"
  >
    <div
      class="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium" title={video.title}>
            {video.title}
          </p>
          <p class="text-muted-foreground truncate text-xs">
            {video.channelName}
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
            onclick={() => playerState.skipVideo(-15)}
          >
            <SkipBack size={18} />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            class="cursor-pointer rounded-full"
            title={video.isPlaying ? 'Pause' : 'Play'}
            onclick={() => playerState.toggleVideoPlayPause()}
          >
            {#if video.isPlaying}
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
            onclick={() => playerState.skipVideo(15)}
          >
            <SkipForward size={18} />
          </Button>
        </div>
        <div class="hidden w-full max-w-md items-center gap-2 sm:flex">
          <span class="text-muted-foreground w-10 text-right text-xs">
            {formatEpisodeDuration(videoScrubTime)}
          </span>
          <Slider
            type="single"
            bind:value={videoScrubTime}
            max={video.duration || 1}
            step={1}
            onValueChange={() => (isScrubbingVideo = true)}
            onValueCommit={(seconds) => {
              isScrubbingVideo = false;
              playerState.seekVideoTo(seconds);
            }}
            class="flex-1"
          />
          <span class="text-muted-foreground w-10 text-xs">
            {formatEpisodeDuration(video.duration)}
          </span>
        </div>
      </div>

      <div class="flex flex-1 justify-end"></div>
    </div>
  </div>
{:else if playerState.currentEpisode}
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
            {formatEpisodeDuration(podcastScrubTime)}
          </span>
          <Slider
            type="single"
            bind:value={podcastScrubTime}
            max={playerState.duration || 1}
            step={1}
            onValueChange={() => (isScrubbingPodcast = true)}
            onValueCommit={(seconds) => {
              isScrubbingPodcast = false;
              playerState.seekTo(seconds);
            }}
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
