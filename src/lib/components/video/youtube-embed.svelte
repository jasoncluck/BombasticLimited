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

  // Video history tracking
  let watchTimeTracker = $state<ReturnType<
    typeof createVideoWatchTimeTracker
  > | null>(null);

  // Track the current video/user combination to prevent unnecessary tracker recreation
  let currentTrackingKey = $state<string | null>(null);

  // Initialize watch time tracker when component mounts
  onMount(() => {
    const userId = session?.user?.id;
    const videoId = video.id;

    if (userId && videoId) {
      const trackingKey = `${userId}-${videoId}`;

      // Only create tracker if we don't already have one for this user/video combination
      if (currentTrackingKey !== trackingKey) {
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

        // Update tracking key
        currentTrackingKey = trackingKey;

        // Start tracking session
        watchTimeTracker.startSession().catch(console.error);
      }
    } else {
      // Clean up if user is not logged in or no video
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }
      currentTrackingKey = null;
    }

    // Cleanup on unmount or change
    return () => {
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }
      currentTrackingKey = null;
    };
  });

  $effect(() => {
    if (!player || typeof window === 'undefined') return;

    const checkAndSeek = () => {
      try {
        if (player.getPlayerState && player.getPlayerState() !== -1) {
          if (player.seekTo && startSeconds) {
            player.seekTo(startSeconds);
          } else if (player.seekTo) {
            player.seekTo(0);
          }
        } else {
          setTimeout(checkAndSeek, 100);
        }
      } catch (error) {
        console.error('Error seeking in video:', error);
      }
    };

    setTimeout(checkAndSeek, 100);
    if (player.seekTo) {
      if (startSeconds) {
        player.seekTo(startSeconds);
      } else {
        player.seekTo(0);
      }
    }
  });

  // Helper function to save timestamp for a specific video with its duration (async for in-app use)
  async function saveTimestampForVideo(
    currentTimeSeconds: number,
    videoDurationSeconds: number,
    playlist?: Playlist | null
  ) {
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
  ) {
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

  function saveCurrentTime({ useBeacon = false } = {}) {
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
          } else {
            saveTimestampForVideo(
              currentTimeSeconds,
              durationSeconds,
              playlist
            );
          }
        }
      } catch (error) {
        console.error('Error while trying to save current video time.', error);
      }
    }
  }

  function handleBeforeUnload() {
    saveCurrentTime({ useBeacon: true });
    // End watch time tracking session before page unload
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
    currentTrackingKey = null;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      saveCurrentTime({ useBeacon: true });
      // End watch time tracking session when page becomes hidden
      if (watchTimeTracker) {
        watchTimeTracker.endSession().catch(console.error);
        watchTimeTracker = null;
      }
      currentTrackingKey = null;
    }
  }

  // YouTube Player Setup
  function onPlayerReady(event: {
    target: { seekTo: (startSeconds: number) => void };
  }) {
    if (startSeconds) {
      event.target.seekTo(startSeconds);
    }
  }

  // Handle YouTube player state changes for video history tracking
  function onPlayerStateChange(event: { data: number; target: any }) {
    if (!watchTimeTracker) return;

    const currentTime = event.target.getCurrentTime() || 0;

    // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
    switch (event.data) {
      case YT.PlayerState.PLAYING:
        watchTimeTracker.onPlay(currentTime);
        break;
      case YT.PlayerState.PAUSED: // Paused
        watchTimeTracker.onPause(currentTime);
        break;
      case YT.PlayerState.ENDED: // Ended
        watchTimeTracker.onPause(currentTime);
        break;
    }
  }

  // Handle seeking events
  let lastKnownTime = 0;
  function handleSeekingEvents() {
    if (!player || !watchTimeTracker) return;

    try {
      const currentTime = player.getCurrentTime() || 0;
      const timeDiff = Math.abs(currentTime - lastKnownTime);

      // If time difference is significant (more than 2 seconds), it's likely a seek
      if (timeDiff > 2) {
        watchTimeTracker.onSeek(currentTime);
      }

      lastKnownTime = currentTime;
    } catch (error) {
      // Ignore errors, player might not be ready
    }
  }

  // Set up periodic seeking detection
  let seekDetectionInterval: NodeJS.Timeout | null = null;
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

  beforeNavigate(() => {
    saveCurrentTime(); // async is ok for in-app navigation

    // End watch time tracking session before navigation
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
    currentTrackingKey = null;
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      saveCurrentTime();
    }

    // Ensure watch time tracker is properly ended
    if (watchTimeTracker) {
      watchTimeTracker.endSession().catch(console.error);
      watchTimeTracker = null;
    }
    currentTrackingKey = null;
  });
</script>

<AspectRatio ratio={16 / 9}>
  <VideoEmbed divId="player" />
</AspectRatio>
