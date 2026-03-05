<script lang="ts">
  import type {
    PostgrestError,
    Session,
    SupabaseClient,
  } from '@supabase/supabase-js';
  import { onMount, onDestroy } from 'svelte';
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

  // YouTube Player types
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

  let queryParamTimestamp = $state(0);
  let savedTimestamp = $state(0);
  let player = $state<YouTubePlayer | null>(null);
  let hasFirstPlayOccurred = $state(false);
  let isPlayerReady = $state(false);

  // Video history tracking
  let watchTimeTracker = $state<ReturnType<
    typeof createVideoWatchTimeTracker
  > | null>(null);

  // Track if the video is actually playing (not just the YouTube player state)
  let isActuallyPlaying = $state(false);

  // Cleanup tracking
  let cleanupFunctions: (() => void)[] = [];
  let seekDetectionInterval: ReturnType<typeof setInterval> | null = null;

  // Watch for URL parameter changes
  $effect(() => {
    const searchParamT = page.url.searchParams.get('t');
    const newQueryParamTimestamp = searchParamT
      ? parseInt(searchParamT, 10)
      : 0;

    if (newQueryParamTimestamp !== queryParamTimestamp) {
      queryParamTimestamp = newQueryParamTimestamp;

      // If we have a query param timestamp and the video is playing or paused, seek immediately and play
      if (player && isPlayerReady && newQueryParamTimestamp > 0) {
        player.seekTo(newQueryParamTimestamp);
        player.playVideo();
      }
    }
  });

  // Function to determine which timestamp to use for initial seek
  function getInitialSeekTimestamp(): number {
    // Priority: query param 't' > saved timestamp > 0
    if (queryParamTimestamp > 0) {
      return queryParamTimestamp;
    }
    if (savedTimestamp > 0) {
      return savedTimestamp;
    }
    return 0;
  }

  // Function to seek to the appropriate timestamp on first play
  function handleFirstPlay(): void {
    if (!player || !isPlayerReady || hasFirstPlayOccurred) return;

    const seekTo = getInitialSeekTimestamp();
    if (seekTo > 0) {
      try {
        player.seekTo(seekTo);
      } catch (error) {
        console.error('Error seeking in video:', error);
      }
    }

    hasFirstPlayOccurred = true;
  }

  // Helper function to save timestamp for a specific video with its duration (async for in-app use)
  function saveTimestampForVideo(
    currentTimeSeconds: number,
    videoDurationSeconds: number,
    playlist?: Playlist | null
  ): Promise<{ error?: PostgrestError | null }> {
    if (
      !videoDurationSeconds ||
      currentTimeSeconds <= VIDEO_SAVE_SECONDS_START
    ) {
      return Promise.resolve({ error: null });
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    if (watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT) {
      return handleAddVideoTimestamp({
        videoTimestamp: {
          videoId: video.id,
          playlistId: playlist?.id,
          watchedAt: new Date(),
          sortedBy:
            contentFilter && isPlaylistVideosFilter(contentFilter)
              ? contentFilter.sort.key
              : null,
          sortOrder:
            contentFilter && isPlaylistVideosFilter(contentFilter)
              ? contentFilter.sort.order
              : null,
        },
        session,
        supabase,
      });
    } else {
      return handleAddVideoTimestamp({
        videoTimestamp: {
          videoId: video.id,
          playlistId: playlist?.id,
          timestampStartSeconds: currentTimeSeconds,
          watchedAt: null,
          sortedBy:
            contentFilter && isPlaylistVideosFilter(contentFilter)
              ? contentFilter.sort.key
              : null,
          sortOrder:
            contentFilter && isPlaylistVideosFilter(contentFilter)
              ? contentFilter.sort.order
              : null,
        },
        session,
        supabase,
      });
    }
  }

  // Save timestamp using sendBeacon for background/unload events
  function saveTimestampBeacon(
    currentTimeSeconds: number,
    videoDurationSeconds: number,
    playlist?: Playlist | null,
    contentFilter?: CombinedContentFilter
  ): void {
    if (
      !videoDurationSeconds ||
      currentTimeSeconds <= VIDEO_SAVE_SECONDS_START
    ) {
      return;
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    const watchedAt =
      watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT ? new Date() : null;

    const payload: { videoTimestamp: TimestampWithVideoId } = {
      videoTimestamp: {
        watchedAt,
        timestampStartSeconds: currentTimeSeconds,
        videoId: video.id,
        playlistId: playlist?.id,
        sortedBy:
          contentFilter && isPlaylistVideosFilter(contentFilter)
            ? contentFilter.sort.key
            : null,
        sortOrder:
          contentFilter && isPlaylistVideosFilter(contentFilter)
            ? contentFilter.sort.order
            : null,
      },
    };

    // Use your real API endpoint here
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/save-timestamp', JSON.stringify(payload));
    }
  }

  function saveCurrentTime({ useBeacon = false } = {}): Promise<{
    error?: PostgrestError | null;
  } | void> {
    if (player && player.getCurrentTime) {
      try {
        const currentTimeSeconds = player.getCurrentTime();

        // Always save the current timestamp regardless of query params or initial timestamps
        // Only skip if we're very close to the start of the video
        if (currentTimeSeconds > VIDEO_SAVE_SECONDS_START) {
          if (useBeacon) {
            saveTimestampBeacon(
              currentTimeSeconds,
              durationSeconds,
              playlist,
              contentFilter
            );
            return Promise.resolve();
          } else {
            // Return the promise for async saves and track it in content state
            const savePromise = saveTimestampForVideo(
              currentTimeSeconds,
              durationSeconds,
              playlist
            );

            // Track this promise in the content state
            if (savePromise) {
              contentState.addPendingVideoOperation(savePromise);
            }

            return savePromise || Promise.resolve();
          }
        }
      } catch (error) {
        console.error('Error while trying to save current video time.', error);
      }
    }
    return Promise.resolve();
  }

  function handleBeforeUnload(): void {
    saveCurrentTime({ useBeacon: true });

    // End watch time tracking session before page unload
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      // Save current timestamp position but DON'T end the tracking session
      saveCurrentTime({ useBeacon: true });

      // Pause the video tracking if it's currently playing
      if (isActuallyPlaying && watchTimeTracker) {
        const currentTime = player?.getCurrentTime() || 0;
        watchTimeTracker.onPause(currentTime);
        isActuallyPlaying = false;
      }
    } else if (document.visibilityState === 'visible') {
      // Resume tracking if the YouTube player is actually playing
      if (player && watchTimeTracker) {
        const playerState = player.getPlayerState();
        const currentTime = player.getCurrentTime() || 0;

        // YouTube player states: 1 = playing
        if (playerState === 1) {
          watchTimeTracker.onPlay(currentTime);
          isActuallyPlaying = true;
        }
      }
    }
  }

  // YouTube Player Setup
  function onPlayerReady(): void {
    isPlayerReady = true;
  }

  // Handle YouTube player state changes for video history tracking
  function onPlayerStateChange(event: YouTubeStateChangeEvent): void {
    if (!event.target) {
      return;
    }

    const currentTime = event.target.getCurrentTime() || 0;

    // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
    switch (event.data) {
      case 1: // Playing
        // Handle first play - seek to appropriate timestamp
        if (!hasFirstPlayOccurred) {
          handleFirstPlay();
        }

        if (watchTimeTracker) {
          watchTimeTracker.onPlay(currentTime);
        }
        isActuallyPlaying = true;
        break;
      case 2: // Paused
        if (watchTimeTracker) {
          watchTimeTracker.onPause(currentTime);
        }
        isActuallyPlaying = false;
        break;
      case 0: // Ended
        if (watchTimeTracker) {
          watchTimeTracker.onPause(currentTime);
        }
        isActuallyPlaying = false;
        break;
      case 3: // Buffering
        // Don't change isActuallyPlaying state during buffering
        break;
      default:
        break;
    }
  }

  // Handle seeking events
  let lastKnownTime = 0;
  function handleSeekingEvents(): void {
    if (!player || !watchTimeTracker) return;

    const currentTime = player.getCurrentTime() || 0;
    const timeDiff = Math.abs(currentTime - lastKnownTime);

    // If time difference is significant (more than 2 seconds), it's likely a seek
    if (timeDiff > 2) {
      watchTimeTracker.onSeek(currentTime);
    }

    lastKnownTime = currentTime;
  }

  // Set up periodic seeking detection with proper cleanup
  $effect(() => {
    if (player && watchTimeTracker && !seekDetectionInterval) {
      seekDetectionInterval = setInterval(handleSeekingEvents, 1000);
    }

    return () => {
      if (seekDetectionInterval) {
        clearInterval(seekDetectionInterval);
        seekDetectionInterval = null;
      }
    };
  });

  // Initialize watch time tracker when component mounts
  onMount(() => {
    const userId = session?.user?.id;
    const videoId = video.id;

    if (userId && videoId) {
      // Clean up existing tracker if any
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }

      // Create new tracker
      watchTimeTracker = createVideoWatchTimeTracker({
        videoId,
        supabase,
        session,
      });

      // Start tracking session
      watchTimeTracker.startSession().catch(console.error);
    } else {
      // Clean up if user is not logged in or no video
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }
    }

    // Cleanup function
    const cleanup = () => {
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }
    };

    cleanupFunctions.push(cleanup);
    return cleanup;
  });

  onMount(async () => {
    // Get current search param 't'
    const searchParamT = page.url.searchParams.get('t');
    if (searchParamT) {
      queryParamTimestamp = parseInt(searchParamT, 10);
    }

    // Always fetch saved timestamp from backend regardless of query param
    if (isVideoWithTimestamp(video)) {
      const { videoTimestamp } = await getLatestTimestamp({
        videoId: video.id,
        session,
        supabase,
      });
      if (videoTimestamp) {
        savedTimestamp = videoTimestamp.video_start_seconds ?? 0;
      }
    }
  });

  onMount(() => {
    if (typeof window !== 'undefined') {
      const windowRef = window as unknown as WindowWithYouTube;

      if (windowRef.YT) {
        player = new windowRef.YT.Player('player', {
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
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Add cleanup for event listeners
      const cleanup = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
      };

      cleanupFunctions.push(cleanup);
    }
  });

  beforeNavigate(async () => {
    // Wait for the timestamp save to complete before navigating
    const savePromise = saveCurrentTime();
    if (savePromise) {
      try {
        await savePromise;
      } catch {
        console.error('Error saving timestamp before navigation');
      }
    }

    // End watch time tracking session before navigation
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
  });

  onDestroy(async () => {
    // Clean up all registered cleanup functions
    cleanupFunctions.forEach((cleanup) => cleanup());
    cleanupFunctions = [];

    // Clear interval if it exists
    if (seekDetectionInterval) {
      clearInterval(seekDetectionInterval);
      seekDetectionInterval = null;
    }

    if (typeof window !== 'undefined') {
      const savePromise = saveCurrentTime();
      if (savePromise) {
        try {
          await savePromise;
        } catch {
          console.error('Error saving timestamp in onDestroy');
        }
      }
    }

    // Ensure watch time tracker is properly ended
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
  });
</script>

<AspectRatio ratio={16 / 9} class="mx-auto flex w-full max-w-[1100px] ">
  <VideoEmbed divId="player" />
</AspectRatio>
