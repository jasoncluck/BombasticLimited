<script lang="ts">
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { onMount, onDestroy } from "svelte";
  import VideoEmbed from "$lib/components/video/video-embed.svelte";
  import { saveVideoTimestamp } from "$lib/supabase/timestamps";
  import { beforeNavigate } from "$app/navigation";
  import type { Playlist } from "$lib/supabase/playlists";
  import { handleAddVideoTimestamp } from "./video-service";
  import type { Video } from "$lib/supabase/videos";

  // Amount of seconds to wait before saving a new timestamp if none exists
  const VIDEO_SAVE_SECONDS_START = 15;
  // Amount of seconds offset from the end of the video to delete a timstamp
  const VIDEO_DELETE_SECONDS_PERCENT = 0.9;
  // Amount of seconds offset to save a new timestamp if one already exists
  const VIDEO_SAVE_SECONDS_DELTA = 15;

  const {
    video,
    startSeconds,
    supabase,
    session,
    durationSeconds,
  }: {
    video: Video;
    startSeconds: number | undefined | null;
    supabase: SupabaseClient;
    session: Session | null;
    durationSeconds: number;
    playlist?: Playlist;
  } = $props();

  let player = $state<any>();

  $effect(() => {
    if (!player || !window) return;

    // Wait for the video to load before seeking
    const checkAndSeek = () => {
      try {
        if (player.getPlayerState && player.getPlayerState() !== -1) {
          // Video is loaded, now seek to the start time
          if (player.seekTo && startSeconds) {
            player.seekTo(startSeconds);
          } else if (player.seekTo) {
            player.seekTo(0);
          }
        } else {
          // Video not loaded yet, check again in a bit
          setTimeout(checkAndSeek, 100);
        }
      } catch (error) {
        console.error("Error seeking in video:", error);
      }
    };

    // Start checking if video is ready
    setTimeout(checkAndSeek, 100);
    if (player.seekTo) {
      if (startSeconds) {
        player.seekTo(startSeconds);
      } else {
        player.seekTo(0);
      }
    }
  });

  onMount(() => {
    const windowRef: any = window;

    if (typeof windowRef.YT !== "undefined") {
      player = new windowRef.YT.Player("player", {
        videoId: video.id,
        playerVars: {
          playsinline: 1,
          fs: 1, // Enable fullscreen button
          rel: 0, // Only show related videos from current channel
          modestbranding: true, // Reduce YouTube branding
        },
        events: {
          onReady: onPlayerReady,
          // onStateChange: onPlayerStateChange,
        },
      });
    }

    window.addEventListener("beforeunload", saveCurrentTime);
  });

  beforeNavigate(() => {
    console.log("in before navigat");
    saveCurrentTime();
  });

  onDestroy(() => {
    console.log("in on destroy");
    saveCurrentTime();
  });

  // Autoplay
  function onPlayerReady(event: {
    target: { seekTo: (startSeconds: number) => void };
  }) {
    if (startSeconds) {
      event.target.seekTo(startSeconds);
    }
  }

  // Helper function to save timestamp for a specific video with its duration
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

  function saveCurrentTime() {
    if (player && player.getCurrentTime) {
      try {
        const currentTimeSeconds = player.getCurrentTime() as number;

        // Only save if it's different enough from the start time
        if (
          !startSeconds ||
          Math.abs(currentTimeSeconds - startSeconds) > VIDEO_SAVE_SECONDS_DELTA
        ) {
          saveTimestampForVideo(video, currentTimeSeconds, durationSeconds);
        }
      } catch (error) {
        console.error("Error while trying to save current video time.", error);
      }
    }
  }
</script>

<VideoEmbed divId="player" />
