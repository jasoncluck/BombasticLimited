/**
 * Video service contains some clientside "helper" functions that
 * do not interact directly with the supabase API directly.
 */
import {
  type Video,
  getInProgressVideos,
  type VideoWithTimestamp,
} from "$lib/supabase/videos";
import { getVideos } from "$lib/supabase/videos";
import { showNotification } from "$lib/stores/notification.js";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import type { Source } from "$lib/constants/source";
import type { TimestampFilter, VideoFilter } from "../content/content-filter";
import { type MostRecentVideo } from "$lib/state/videos.svelte";
import { goto, invalidate } from "$app/navigation";
import { deleteVideoTimestamp } from "$lib/supabase/timestamps";

export async function fetchMoreInProgressVideos({
  contentFilter,
  limit,
  session,
  supabase,
  setHasMoreVideos,
}: {
  lastSeenVideo: Video;
  contentFilter: TimestampFilter;
  limit: number;
  session?: Session | null;
  supabase: SupabaseClient<Database>;
  setHasMoreVideos: (hasMore: boolean) => void;
}) {
  const { videos: newVideos, error } = await getInProgressVideos({
    contentFilter,
    limit,
    supabase,
    session,
  });

  if (error) {
    showNotification(
      `Unable to retrieve next set of videos: ${error.message}`,
      "error",
    );
    return [];
  }

  if (newVideos.length < limit || !newVideos.length) {
    setHasMoreVideos(false);
  }

  return newVideos;
}

export async function fetchMoreSourceVideos({
  source,
  searchString,
  contentFilter,
  limit,
  session,
  supabase,
  setHasMoreVideos,
}: {
  searchString?: string;
  source: Source;
  contentFilter: VideoFilter;
  limit: number;
  setHasMoreVideos: (hasMore: boolean) => void;
  supabase: SupabaseClient<Database>;
  session?: Session | null;
}) {
  const { videos: newVideos, error } = await getVideos({
    limit,
    searchString,
    contentFilter,
    source,
    supabase,
    session,
  });

  if (error) {
    showNotification(
      `Unable to retrieve next set of videos for ${source}: ${error.message}`,
      "error",
    );
    return [];
  }

  if (newVideos.length < limit || !newVideos.length) {
    setHasMoreVideos(false);
  }

  return newVideos;
}

/**
 * Optimistically update a video timestamp local state - only to be used for videos cached on client
 */
export async function updateVideoTimestampState({
  videos,
  mostRecentVideo,
  isContinueVideos = false,
}: {
  videos: Video[];
  mostRecentVideo: MostRecentVideo;
  isContinueVideos?: boolean;
}) {
  console.log("IN UPDATE VIDEO TIMESTAMP");
  if (mostRecentVideo.timestamp) {
    const videoIndexToUpdate = videos.findIndex((video) => {
      return video.id === mostRecentVideo.timestamp?.video_id;
    });

    if (videoIndexToUpdate >= -1) {
      videos[videoIndexToUpdate] = {
        ...videos[videoIndexToUpdate],
        video_start_seconds: mostRecentVideo.timestamp.video_start_seconds,
        updated_at: mostRecentVideo.timestamp.updated_at,
      } as VideoWithTimestamp;

      // Only reorder the continue watching view
      if (isContinueVideos) {
        const videoToMove = videos[videoIndexToUpdate];
        videos.splice(videoIndexToUpdate, 1);
        videos.unshift(videoToMove);
      }
    }
  }
}

export async function handleDeleteVideoTimestamp({
  e,
  videoId,
  isContinueVideos,
  invalidateOnVideoChange,
  supabase,
  session,
}: {
  e: Event;
  videoId: string;
  videos: Video[];
  isContinueVideos?: boolean;
  invalidateOnVideoChange: boolean;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/");
    return;
  }

  e.preventDefault();

  const { error } = await deleteVideoTimestamp({
    videoId,
    supabase,
    session,
  });
  if (error) {
    showNotification("Unable to remove video from watchlist.");
  } else {
    showNotification(
      isContinueVideos
        ? "Removed from Continue Watching"
        : "Video progress reset.",
    );
    if (invalidateOnVideoChange) {
      invalidate("supabase:db:videos");
    }
  }
}

/**
 * Duration from YT response is ISO 8601 format.
 * This converts that to seconds so it's comparable to the offset.
 */
export function getVideoDuration(duration: string | null) {
  if (!duration) {
    throw new Error("Invalid duration, unable to get duration of video");
  }
  const regex =
    /P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;

  const matches = duration.match(regex);
  if (!matches) {
    throw new Error("Invalid ISO 8601 duration format");
  }

  const hours = parseInt(matches[1] || "0", 10);
  const minutes = parseInt(matches[2] || "0", 10);
  const seconds = parseInt(matches[3] || "0", 10);

  return { hours, minutes, seconds };
}

/**
 * Returns the duration in seconds
 */
export function videoDurationToSeconds(duration: string | null): number {
  const { hours, minutes, seconds } = getVideoDuration(duration);

  return hours * 3600 + minutes * 60 + seconds;
}

export function videoDurationSecondsToTime(durationSeconds: number) {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  return { hours, minutes, seconds };
}

/**
 * Duration from YT response is ISO 8601 format
 */
export function getVideoSecondsOffset({
  duration,
  timestampSeconds,
}: {
  duration: string;
  timestampSeconds: number;
}) {
  if (!timestampSeconds || !duration) {
    return 0;
  }
  return Math.floor(
    (timestampSeconds / videoDurationToSeconds(duration)) * 100,
  );
}
