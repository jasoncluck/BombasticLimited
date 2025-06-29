<script lang="ts">
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { onMount, onDestroy } from "svelte";
  import VideoEmbed from "$lib/components/video/video-embed.svelte";
  import {
    getLatestTimestamp,
    saveVideoTimestamp,
  } from "$lib/supabase/timestamps";
  import { beforeNavigate } from "$app/navigation";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import { page } from "$app/state";

  const VIDEO_SAVE_SECONDS_START = 15;
  const VIDEO_DELETE_SECONDS_PERCENT = 0.9;
  const VIDEO_SAVE_SECONDS_DELTA = 15;

  const {
    video,
    supabase,
    session,
    durationSeconds,
  }: {
    video: Video;
    supabase: SupabaseClient;
    session: Session | null;
    durationSeconds: number;
    playlist?: Playlist;
  } = $props();

  let startSeconds = $state(0);

  let player = $state<any>();

  $effect(() => {
    if (!player || typeof window === "undefined") return;

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
        console.error("Error seeking in video:", error);
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
  function saveTimestampForVideo(
    video: Video,
    currentTimeSeconds: number,
    videoDurationSeconds: number,
  ) {
    if (
      !videoDurationSeconds ||
      currentTimeSeconds <= VIDEO_SAVE_SECONDS_START
    ) {
      return;
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    if (watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT) {
      saveVideoTimestamp({
        watchedAt: new Date(),
        currentTimeSeconds,
        videoId: video.id,
        session,
        supabase,
      });
    } else {
      saveVideoTimestamp({
        watchedAt: null,
        currentTimeSeconds,
        videoId: video.id,
        session,
        supabase,
      });
    }
  }

  // Save timestamp using sendBeacon for background/unload events
  function saveTimestampBeacon(
    video: Video,
    currentTimeSeconds: number,
    videoDurationSeconds: number,
  ) {
    if (
      !videoDurationSeconds ||
      currentTimeSeconds <= VIDEO_SAVE_SECONDS_START
    ) {
      return;
    }

    const watchedPercent = currentTimeSeconds / videoDurationSeconds;
    const watchedAt =
      watchedPercent >= VIDEO_DELETE_SECONDS_PERCENT
        ? new Date().toISOString()
        : null;

    const payload = {
      watchedAt,
      currentTimeSeconds,
      videoId: video.id,
      // Add user/session info if needed (e.g. userId: session?.user.id)
    };

    // Use your real API endpoint here
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/save-timestamp", JSON.stringify(payload));
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
            saveTimestampBeacon(video, currentTimeSeconds, durationSeconds);
          } else {
            saveTimestampForVideo(video, currentTimeSeconds, durationSeconds);
          }
        }
      } catch (error) {
        console.error("Error while trying to save current video time.", error);
      }
    }
  }

  function handleBeforeUnload() {
    saveCurrentTime({ useBeacon: true });
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
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
    const searchParamT = page.url.searchParams.get("t");
    if (searchParamT) {
      startSeconds = parseInt(searchParamT, 10);
    } else {
      // Always fetch from backend if no param
      const { videoTimestamp } = await getLatestTimestamp({
        videoId: video.id,
        session,
        supabase,
      });
      if (videoTimestamp) {
        startSeconds = videoTimestamp.video_start_seconds ?? 0;
      } else {
        startSeconds = 0;
      }
    }
  });

  onMount(() => {
    if (typeof window !== "undefined") {
      const windowRef: any = window;
      if (typeof windowRef.YT !== "undefined") {
        player = new windowRef.YT.Player("player", {
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
      window.addEventListener("beforeunload", handleBeforeUnload);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  beforeNavigate(() => {
    saveCurrentTime(); // async is ok for in-app navigation
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      saveCurrentTime();
    }
  });
</script>

<VideoEmbed divId="player" />
