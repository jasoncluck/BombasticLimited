<script lang="ts">
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import { onMount, onDestroy, tick } from 'svelte';
  import VideoEmbed from '$lib/components/video/video-embed.svelte';
  import {
    getLatestTimestamp,
    type TimestampWithVideoId,
  } from '$lib/supabase/timestamps';
  import { beforeNavigate } from '$app/navigation';
  import type { Playlist } from '$lib/supabase/playlists';
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { page } from '$app/state';
  import {
    isPlaylistVideosFilter,
    type CombinedContentFilter,
  } from '../content/content-filter';
  import AspectRatio from '../ui/aspect-ratio/aspect-ratio.svelte';
  import {
    handleAddVideoTimestamp,
    createVideoWatchTimeTracker,
  } from './video-service';
  import { getContentState } from '$lib/state/content.svelte';

  const VIDEO_SAVE_SECONDS_START = 15;
  const VIDEO_DELETE_SECONDS_PERCENT = 0.95;
  const SEEK_DETECTION_INTERVAL = 2000; // Reduced frequency
  const SIGNIFICANT_SEEK_THRESHOLD = 3; // Increased threshold

  const {
    video,
    supabase,
    session,
    playlist,
    durationSeconds,
    contentFilter,
  }: {
    video: Video;
    supabase: SupabaseClient;
    session: Session | null;
    durationSeconds: number;
    contentFilter?: CombinedContentFilter;
    playlist?: Playlist | null;
  } = $props();

  // YouTube Player types (same as before)
  interface YouTubePlayer {
    seekTo: (seconds: number) => void;
    getCurrentTime: () => number;
    getPlayerState: () => number;
    playVideo: () => void;
  }

  interface YouTubePlayerEvent {
    target: YouTubePlayer;
  }

  interface YouTubeStateChangeEvent {
    data: number;
    target: YouTubePlayer;
  }

  interface YouTubeAPI {
    Player: new (
      elementId: string,
      config: {
        videoId: string;
        playerVars: Record<string, number | boolean>;
        events: {
          onReady: (event: YouTubePlayerEvent) => void;
          onStateChange: (event: YouTubeStateChangeEvent) => void;
        };
      }
    ) => YouTubePlayer;
  }

  interface WindowWithYouTube extends Window {
    YT?: YouTubeAPI;
  }

  // Get content state for tracking pending operations
  const contentState = getContentState();

  // Consolidated state - fewer reactive variables
  let playerState = $state({
    player: null as YouTubePlayer | null,
    isReady: false,
    hasFirstPlayOccurred: false,
    isActuallyPlaying: false,
    queryParamTimestamp: 0,
    savedTimestamp: 0,
  });

  // Video history tracking
  let watchTimeTracker = $state<ReturnType<
    typeof createVideoWatchTimeTracker
  > | null>(null);

  // Debounced URL parameter tracking
  let urlParamDebouncer: ReturnType<typeof setTimeout> | null = null;
  
  // Single effect for URL changes with debouncing
  $effect(() => {
    const searchParamT = page.url.searchParams.get('t');
    const newQueryParamTimestamp = searchParamT ? parseInt(searchParamT, 10) : 0;

    if (newQueryParamTimestamp !== playerState.queryParamTimestamp) {
      // Clear existing debouncer
      if (urlParamDebouncer) {
        clearTimeout(urlParamDebouncer);
      }

      // Debounce URL parameter changes
      urlParamDebouncer = setTimeout(() => {
        playerState.queryParamTimestamp = newQueryParamTimestamp;

        // Only seek if player is ready and we have a valid timestamp
        if (
          playerState.player && 
          playerState.isReady && 
          newQueryParamTimestamp > 0
        ) {
          try {
            playerState.player.seekTo(newQueryParamTimestamp);
            playerState.player.playVideo();
          } catch (error) {
            console.error('Error seeking to URL timestamp:', error);
          }
        }
      }, 100); // 100ms debounce
    }
  });

  // Optimized tracker initialization
  function initializeWatchTimeTracker(): void {
    const userId = session?.user?.id;
    const videoId = video.id;

    if (!userId || !videoId) {
      cleanupWatchTimeTracker();
      return;
    }

    // Clean up existing tracker
    cleanupWatchTimeTracker();

    // Create and start new tracker
    try {
      watchTimeTracker = createVideoWatchTimeTracker({
        videoId,
        supabase,
        session,
      });
      watchTimeTracker.startSession().catch(console.error);
    } catch (error) {
      console.error('Error initializing watch time tracker:', error);
    }
  }

  function cleanupWatchTimeTracker(): void {
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
  }

  // Optimized timestamp determination
  function getInitialSeekTimestamp(): number {
    return playerState.queryParamTimestamp > 0 
      ? playerState.queryParamTimestamp 
      : playerState.savedTimestamp > 0 
        ? playerState.savedTimestamp 
        : 0;
  }

  // Optimized first play handler
  function handleFirstPlay(): void {
    if (!playerState.player || !playerState.isReady || playerState.hasFirstPlayOccurred) {
      return;
    }

    const seekTo = getInitialSeekTimestamp();
    if (seekTo > 0) {
      try {
        playerState.player.seekTo(seekTo);
      } catch (error) {
        console.error('Error seeking in video:', error);
      }
    }

    playerState.hasFirstPlayOccurred = true;
  }

  // Consolidated timestamp saving function
  async function saveTimestampForVideo(
    currentTimeSeconds: number,
    videoDurationSeconds: number,
    playlist?: Playlist | null
  ): Promise<void> {
    if (!videoDurationSeconds || currentTimeSeconds <= VIDEO_SAVE_SECONDS_START) {
      return;
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    const videoTimestamp: TimestampWithVideoId = {
      videoId: video.id,
      playlistId: playlist?.id,
      watchedAt: watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT ? new Date() : null,
      timestampStartSeconds: currentTimeSeconds,
      sortedBy: contentFilter && isPlaylistVideosFilter(contentFilter)
        ? contentFilter.sort.key
        : null,
      sortOrder: contentFilter && isPlaylistVideosFilter(contentFilter)
        ? contentFilter.sort.order
        : null,
    };

    return handleAddVideoTimestamp({
      videoTimestamp,
      session,
      supabase,
    });
  }

  // Optimized beacon saving
  function saveTimestampBeacon(
    currentTimeSeconds: number,
    videoDurationSeconds: number,
    playlist?: Playlist | null,
    contentFilter?: CombinedContentFilter
  ): void {
    if (!videoDurationSeconds || currentTimeSeconds <= VIDEO_SAVE_SECONDS_START) {
      return;
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    const payload = {
      videoTimestamp: {
        watchedAt: watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT ? new Date() : null,
        timestampStartSeconds: currentTimeSeconds,
        videoId: video.id,
        playlistId: playlist?.id,
        sortedBy: contentFilter && isPlaylistVideosFilter(contentFilter)
          ? contentFilter.sort.key
          : null,
        sortOrder: contentFilter && isPlaylistVideosFilter(contentFilter)
          ? contentFilter.sort.order
          : null,
      },
    };

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/save-timestamp', JSON.stringify(payload));
    }
  }

  // Throttled save function
  let saveThrottler: ReturnType<typeof setTimeout> | null = null;
  function saveCurrentTime({ useBeacon = false, force = false } = {}): Promise<void> {
    if (!playerState.player?.getCurrentTime) {
      return Promise.resolve();
    }

    // Throttle saves unless forced
    if (!force && !useBeacon && saveThrottler) {
      return Promise.resolve();
    }

    try {
      const currentTimeSeconds = playerState.player.getCurrentTime();

      if (currentTimeSeconds > VIDEO_SAVE_SECONDS_START) {
        if (useBeacon) {
          saveTimestampBeacon(currentTimeSeconds, durationSeconds, playlist, contentFilter);
          return Promise.resolve();
        } else {
          // Throttle async saves
          if (!force) {
            if (saveThrottler) clearTimeout(saveThrottler);
            saveThrottler = setTimeout(() => {
              saveThrottler = null;
            }, 1000);
          }

          const savePromise = saveTimestampForVideo(
            currentTimeSeconds,
            durationSeconds,
            playlist
          );

          if (savePromise) {
            contentState.addPendingVideoOperation(savePromise);
          }

          return savePromise || Promise.resolve();
        }
      }
    } catch (error) {
      console.error('Error while trying to save current video time:', error);
    }

    return Promise.resolve();
  }

  // Event handlers
  function handleBeforeUnload(): void {
    saveCurrentTime({ useBeacon: true, force: true });
    cleanupWatchTimeTracker();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      saveCurrentTime({ useBeacon: true, force: true });
      
      if (playerState.isActuallyPlaying && watchTimeTracker) {
        const currentTime = playerState.player?.getCurrentTime() || 0;
        watchTimeTracker.onPause(currentTime);
        playerState.isActuallyPlaying = false;
      }
    } else if (document.visibilityState === 'visible' && playerState.player && watchTimeTracker) {
      const playerStateCode = playerState.player.getPlayerState();
      const currentTime = playerState.player.getCurrentTime() || 0;

      if (playerStateCode === 1) {
        watchTimeTracker.onPlay(currentTime);
        playerState.isActuallyPlaying = true;
      }
    }
  }

  // YouTube Player Setup
  function onPlayerReady(): void {
    playerState.isReady = true;
  }

  function onPlayerStateChange(event: YouTubeStateChangeEvent): void {
    if (!event.target) return;

    const currentTime = event.target.getCurrentTime() || 0;

    switch (event.data) {
      case 1: // Playing
        if (!playerState.hasFirstPlayOccurred) {
          handleFirstPlay();
        }
        if (watchTimeTracker) {
          watchTimeTracker.onPlay(currentTime);
        }
        playerState.isActuallyPlaying = true;
        break;
      
      case 2: // Paused
      case 0: // Ended
        if (watchTimeTracker) {
          watchTimeTracker.onPause(currentTime);
        }
        playerState.isActuallyPlaying = false;
        break;
      
      case 3: // Buffering - no state change
        break;
    }
  }

  // Optimized seek detection
  let lastKnownTime = 0;
  let seekDetectionInterval: ReturnType<typeof setInterval> | null = null;

  function handleSeekingEvents(): void {
    if (!playerState.player || !watchTimeTracker) return;

    try {
      const currentTime = playerState.player.getCurrentTime() || 0;
      const timeDiff = Math.abs(currentTime - lastKnownTime);

      if (timeDiff > SIGNIFICANT_SEEK_THRESHOLD) {
        watchTimeTracker.onSeek(currentTime);
      }

      lastKnownTime = currentTime;
    } catch (error) {
      // Silently handle errors to avoid console spam
    }
  }

  // Consolidated mount logic
  onMount(async () => {
    try {
      // Initialize URL parameter
      const searchParamT = page.url.searchParams.get('t');
      if (searchParamT) {
        playerState.queryParamTimestamp = parseInt(searchParamT, 10);
      }

      // Fetch saved timestamp if available
      if (isVideoWithTimestamp(video)) {
        const { videoTimestamp } = await getLatestTimestamp({
          videoId: video.id,
          session,
          supabase,
        });
        
        if (videoTimestamp) {
          playerState.savedTimestamp = videoTimestamp.video_start_seconds ?? 0;
        }
      }

      // Initialize watch time tracker
      initializeWatchTimeTracker();

      // Setup YouTube player if API is available
      if (typeof window !== 'undefined') {
        const windowRef = window as unknown as WindowWithYouTube;

        if (windowRef.YT) {
          playerState.player = new windowRef.YT.Player('player', {
            videoId: video.id,
            playerVars: {
              playsinline: 1,
              fs: 1,
              rel: 0,
              modestbranding: 1,
            },
            events: {
              onReady: onPlayerReady,
              onStateChange: onPlayerStateChange,
            },
          });
        }

        // Setup event listeners
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Start seek detection interval only if we have a player
        await tick();
        if (playerState.player) {
          seekDetectionInterval = setInterval(handleSeekingEvents, SEEK_DETECTION_INTERVAL);
        }
      }
    } catch (error) {
      console.error('Error during YouTube embed initialization:', error);
    }

    // Cleanup function
    return () => {
      if (urlParamDebouncer) {
        clearTimeout(urlParamDebouncer);
      }
      if (saveThrottler) {
        clearTimeout(saveThrottler);
      }
      if (seekDetectionInterval) {
        clearInterval(seekDetectionInterval);
      }
    };
  });

  beforeNavigate(async () => {
    try {
      const savePromise = saveCurrentTime({ force: true });
      await savePromise;
    } catch (error) {
      console.error('Error saving timestamp before navigation:', error);
    }

    cleanupWatchTimeTracker();
  });

  onDestroy(async () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      try {
        const savePromise = saveCurrentTime({ force: true });
        await savePromise;
      } catch (error) {
        console.error('Error saving timestamp in onDestroy:', error);
      }
    }

    // Cleanup intervals and trackers
    if (seekDetectionInterval) {
      clearInterval(seekDetectionInterval);
    }
    
    cleanupWatchTimeTracker();
  });
</script>

<AspectRatio ratio={16 / 9}>
  <VideoEmbed divId="player" />
</AspectRatio>
