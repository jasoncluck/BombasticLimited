<script lang="ts">
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { onMount, onDestroy } from "svelte";
  import VideoEmbed from "$lib/components/video/video-embed.svelte";
  import {
    deleteVideoTimestamp,
    saveVideoTimestamp,
  } from "$lib/supabase/timestamps";
  import { beforeNavigate, invalidate } from "$app/navigation";
  import type { Playlist } from "$lib/supabase/playlists";

  // Amount of seconds to wait before saving a new timestamp if none exists
  const VIDEO_SAVE_SECONDS_START = 15;
  // Amount of seconds offset from the end of the video to delete a timstamp
  const VIDEO_DELETE_SECONDS_OFFSET = 60;
  // Amount of seconds offset to save a new timestamp if one already exists
  const VIDEO_SAVE_SECONDS_DELTA = 15;

  const {
    videoId,
    startSeconds,
    supabase,
    session,
    durationSeconds,
    playlist,
  }: {
    videoId: string;
    startSeconds: number | undefined | null;
    supabase: SupabaseClient;
    session: Session | null;
    durationSeconds: number;
    playlist?: Playlist;
  } = $props();

  let player = $state<any>();
  let currentVideoId = $state<string>();
  let currentVideoDuration = $state<number>();

  $effect(() => {
    if (!player || !window) return;

    try {
      // If the videoId has changed, load the new video
      if (currentVideoId !== videoId) {
        // Save current time for the previous video before switching
        if (currentVideoId && player.getCurrentTime && currentVideoDuration) {
          try {
            const currentTimeSeconds = player.getCurrentTime() as number;
            saveTimestampForVideo(
              currentVideoId,
              currentTimeSeconds,
              currentVideoDuration,
            );
          } catch (error) {
            console.error(
              "Error getting current time before video change:",
              error,
            );
          }
        }

        // Update to new video
        currentVideoId = videoId;
        currentVideoDuration = durationSeconds;
        player.loadVideoById(videoId);

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
      } else {
        // Same video, just update duration if it changed and seek to new time
        currentVideoDuration = durationSeconds;

        if (player.seekTo) {
          if (startSeconds) {
            player.seekTo(startSeconds);
          } else {
            player.seekTo(0);
          }
        }
      }
    } catch (error) {
      console.error("Error updating video:", error);
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

      // Set the initial video ID and duration
      currentVideoId = videoId;
      currentVideoDuration = durationSeconds;
    }

    window.addEventListener("beforeunload", saveCurrentTime);
  });

  beforeNavigate(() => {
    saveCurrentTime();
  });

  onDestroy(() => {
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
  async function saveTimestampForVideo(
    targetVideoId: string,
    currentTimeSeconds: number,
    videoDurationSeconds: number,
  ) {
    if (currentTimeSeconds <= VIDEO_SAVE_SECONDS_START) {
      return;
    }

    if (
      videoDurationSeconds - currentTimeSeconds <=
      VIDEO_DELETE_SECONDS_OFFSET
    ) {
      await deleteVideoTimestamp({ session, supabase, videoId: targetVideoId });
    } else {
      await saveVideoTimestamp({
        currentTimeSeconds,
        videoId: targetVideoId,
        session,
        supabase,
      });
    }
  }

  function saveCurrentTime() {
    if (
      player &&
      player.getCurrentTime &&
      currentVideoId &&
      currentVideoDuration
    ) {
      try {
        const currentTimeSeconds = player.getCurrentTime() as number;

        // Only save if it's different enough from the start time
        if (
          !startSeconds ||
          Math.abs(currentTimeSeconds - startSeconds) > VIDEO_SAVE_SECONDS_DELTA
        ) {
          saveTimestampForVideo(
            currentVideoId,
            currentTimeSeconds,
            currentVideoDuration,
          );
        }
      } catch (error) {
        console.error("Error in saveCurrentTime:", error);
      }
    }
  }
</script>

<VideoEmbed divId="player" />
