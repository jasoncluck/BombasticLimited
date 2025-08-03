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
  import { handleAddVideoTimestamp } from './video-service';

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
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      saveCurrentTime({ useBeacon: true });
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
          events: { onReady: onPlayerReady },
        });
      }
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  beforeNavigate(() => {
    saveCurrentTime(); // async is ok for in-app navigation
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      saveCurrentTime();
    }
  });
</script>

<AspectRatio ratio={16 / 9}>
  <VideoEmbed divId="player" />
</AspectRatio>
