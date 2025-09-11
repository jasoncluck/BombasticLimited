<script lang="ts">
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
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
  import {
    handleAddVideoTimestamp,
    createVideoWatchTimeTracker,
  } from './video-service';
  import { getContentState } from '$lib/state/content.svelte';

  const VIDEO_SAVE_SECONDS_START = 15;
  const VIDEO_DELETE_SECONDS_PERCENT = 0.95;
  const VIDEO_SAVE_SECONDS_DELTA = 15;

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

  let startSeconds = $state(0);
  let player = $state<YouTubePlayer | null>(null);
  let hasInitialSeekOccurred = $state(false);

  // Video history tracking
  let watchTimeTracker = $state<ReturnType<
    typeof createVideoWatchTimeTracker
  > | null>(null);

  // Track if the video is actually playing (not just the YouTube player state)
  let isActuallyPlaying = $state(false);

  // Track whether we've already saved timestamp during navigation to prevent duplicates
  let hasNavigationSaveOccurred = $state(false);

  // YouTube Player Setup
  function onPlayerReady(): void {
    // Don't seek automatically on ready - wait for user to press play
  }

  // Handle YouTube player state changes for video history tracking
  function onPlayerStateChange(event: YouTubeStateChangeEvent): void {
    if (!watchTimeTracker || !event.target) {
      return;
    }

    const currentTime = event.target.getCurrentTime() || 0;

    // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
    switch (event.data) {
      case 1: // Playing
        // Seek to start position when user first presses play
        watchTimeTracker.onPlay(currentTime);
        isActuallyPlaying = true;
        break;
      case 2: // Paused
        watchTimeTracker.onPause(currentTime);
        isActuallyPlaying = false;
        break;
      case 0: // Ended
        watchTimeTracker.onPause(currentTime);
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

  // Set up periodic seeking detection
  let seekDetectionInterval: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (player && watchTimeTracker) {
      seekDetectionInterval = setInterval(handleSeekingEvents, 1000);

      return () => {
        if (seekDetectionInterval) {
          clearInterval(seekDetectionInterval);
        }
      };
    }
  });

  onMount(async () => {
    // Get current search param 't'
    const searchParamT = page.url.searchParams.get('t');
    if (searchParamT) {
      startSeconds = parseInt(searchParamT, 10);
    } else {
      // Always fetch from backend if no param
      if (isVideoWithTimestamp(video)) {
        const { videoTimestamp } = await getLatestTimestamp({
          videoId: video.id,
          session,
          supabase,
        });
        if (videoTimestamp) {
          startSeconds = videoTimestamp.video_start_seconds ?? 0;
        }
      } else {
        startSeconds = 0;
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
          },
          events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
          },
        });
      }
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  beforeNavigate(async () => {
    // Wait for the timestamp save to complete before navigating
    // Mark this as a navigation save to prevent duplicates
    const savePromise = saveCurrentTime({ isNavigationSave: true });
    if (savePromise) {
      try {
        await savePromise;
      } catch (error) {
        console.error('Error saving timestamp before navigation:', error);
      }
    }

    // End watch time tracking session before navigation
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
  });

  onDestroy(async () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Only save current time if we haven't already saved during navigation
      if (!hasNavigationSaveOccurred) {
        const savePromise = saveCurrentTime();
        if (savePromise) {
          try {
            await savePromise;
          } catch (error) {
            console.error('Error saving timestamp in onDestroy:', error);
          }
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

<VideoEmbed divId="player" />
