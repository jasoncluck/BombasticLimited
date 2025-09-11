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
  import AspectRatio from '../ui/aspect-ratio/aspect-ratio.svelte';
  import {
    handleAddVideoTimestamp,
    createVideoWatchTimeTracker,
  } from './video-service';

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

  let startSeconds = $state(0);
  let player = $state<any>();
  let hasInitialSeekOccurred = $state(false);

  // Video history tracking
  let watchTimeTracker = $state<ReturnType<
    typeof createVideoWatchTimeTracker
  > | null>(null);

  // Track if the video is actually playing (not just the YouTube player state)
  let isActuallyPlaying = $state(false);

  // Add a promise to track pending timestamp saves
  let pendingTimestampSave = $state<Promise<void> | null>(null);

  // Create a global store for pending video operations
  if (typeof window !== 'undefined') {
    if (!window.pendingVideoOperations) {
      window.pendingVideoOperations = new Set<Promise<void>>();
    }
  }

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

    // Cleanup on unmount
    return () => {
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }
    };
  });

  // Function to seek to the start position
  function seekToStartPosition(): void {
    if (!player || !player.seekTo) return;

    try {
      if (player.getPlayerState && player.getPlayerState() !== -1) {
        if (startSeconds > 0) {
          player.seekTo(startSeconds);
        } else {
          player.seekTo(0);
        }
        hasInitialSeekOccurred = true;
      } else {
        // If player is not ready, try again after a short delay
        setTimeout(seekToStartPosition, 100);
      }
    } catch (error) {
      console.error('Error seeking in video:', error);
    }
  }

  // Helper function to save timestamp for a specific video with its duration (async for in-app use)
  async function saveTimestampForVideo(
    currentTimeSeconds: number,
    videoDurationSeconds: number,
    playlist?: Playlist | null
  ): Promise<void> {
    if (
      !videoDurationSeconds ||
      currentTimeSeconds <= VIDEO_SAVE_SECONDS_START
    ) {
      return;
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    if (watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT) {
      await handleAddVideoTimestamp({
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
      await handleAddVideoTimestamp({
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

  function saveCurrentTime({ useBeacon = false } = {}): Promise<void> | void {
    if (player && player.getCurrentTime) {
      try {
        const currentTimeSeconds = player.getCurrentTime() as number;
        if (
          !startSeconds ||
          Math.abs(currentTimeSeconds - startSeconds) > VIDEO_SAVE_SECONDS_DELTA
        ) {
          if (useBeacon) {
            saveTimestampBeacon(
              currentTimeSeconds,
              durationSeconds,
              playlist,
              contentFilter
            );
            return;
          } else {
            // Return the promise for async saves
            const savePromise = saveTimestampForVideo(
              currentTimeSeconds,
              durationSeconds,
              playlist
            );

            // Track this promise globally
            if (
              typeof window !== 'undefined' &&
              window.pendingVideoOperations
            ) {
              window.pendingVideoOperations.add(savePromise);
              savePromise.finally(() => {
                if (window.pendingVideoOperations) {
                  window.pendingVideoOperations.delete(savePromise);
                }
              });
            }

            pendingTimestampSave = savePromise;
            return savePromise;
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
  function onPlayerReady(event: {
    target: { seekTo: (startSeconds: number) => void };
  }): void {
    // Don't seek automatically on ready - wait for user to press play
    // event.target is now available as player
  }

  // Handle YouTube player state changes for video history tracking
  function onPlayerStateChange(event: { data: number; target: any }): void {
    if (!watchTimeTracker) {
      return;
    }

    const currentTime = event.target.getCurrentTime() || 0;

    // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
    switch (event.data) {
      case 1: // Playing
        // Seek to start position when user first presses play
        if (!hasInitialSeekOccurred && startSeconds > 0) {
          seekToStartPosition();
        }
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
      const windowRef: any = window;
      if (typeof windowRef.YT !== 'undefined') {
        player = new windowRef.YT.Player('player', {
          videoId: video.id,
          playerVars: {
            playsinline: 1,
            fs: 1,
            rel: 0,
            modestbranding: true,
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
    const savePromise = saveCurrentTime();
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

      // Wait for any pending timestamp save
      if (pendingTimestampSave) {
        try {
          await pendingTimestampSave;
        } catch (error) {
          console.error(
            'Error waiting for timestamp save in onDestroy:',
            error
          );
        }
      } else {
        // If no pending save, try to save current time
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

<AspectRatio ratio={16 / 9}>
  <VideoEmbed divId="player" />
</AspectRatio>
