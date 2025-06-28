<script lang="ts">
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { onMount, onDestroy } from "svelte";
  import VideoEmbed from "$lib/components/video/video-embed.svelte";
  import { saveVideoTimestamp } from "$lib/supabase/timestamps";
  import { beforeNavigate } from "$app/navigation";
  import type { Playlist } from "$lib/supabase/playlists";
  import { mostRecentVideo } from "$lib/state/videos.svelte";

  // Amount of seconds to wait before saving a new timestamp if none exists
  const VIDEO_SAVE_SECONDS_START = 15;
  // Amount of seconds offset from the end of the video to delete a timstamp
  const VIDEO_DELETE_SECONDS_OFFSET = 60 * 5;
  // Amount of seconds offset to save a new timestamp if one already exists
  const VIDEO_SAVE_SECONDS_DELTA = 15;

  const {
    videoId,
    startSeconds,
    supabase,
    session,
    durationSeconds,
  }: {
    videoId: string;
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

  onMount(async () => {
    const windowRef: any = window;

    if (typeof windowRef.YT !== "undefined") {
      player = new windowRef.YT.Player("player", {
        videoId,
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
    targetVideoId: string,
    currentTimeSeconds: number,
    videoDurationSeconds: number,
  ) {
    if (
      !videoDurationSeconds ||
      currentTimeSeconds <= VIDEO_SAVE_SECONDS_START
    ) {
      return;
    }

    if (
      videoDurationSeconds - currentTimeSeconds <=
      VIDEO_DELETE_SECONDS_OFFSET
    ) {
      saveVideoTimestamp({
        currentTimeSeconds,
        watchedAt: new Date(),
        videoId: targetVideoId,
        session,
        supabase,
      });
    } else {
      saveVideoTimestamp({
        currentTimeSeconds,
        videoId: targetVideoId,
        session,
        supabase,
        watchedAt: null,
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
          saveTimestampForVideo(videoId, currentTimeSeconds, durationSeconds);
        }
      } catch (error) {
        console.error("Error while trying to save current video time.", error);
      }
      // invalidate("supabase:db:videos");
    }
  }
</script>

<VideoEmbed divId="player" />
