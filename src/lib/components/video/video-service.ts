/**
 * Video service contains some clientside "helper" functions that
 * do not interact directly with the supabase API directly.
 */
import { type Video, getInProgressVideos } from "$lib/supabase/videos";
import { getVideos } from "$lib/supabase/videos";
import { showNotification } from "$lib/stores/notification.js";
import type {
  PostgrestError,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import type { Source } from "$lib/constants/source";
import type { TimestampFilter, VideoFilter } from "../content/content-filter";
import { goto, invalidate } from "$app/navigation";
import {
  deleteVideoTimestamps,
  saveVideoTimestamp,
  saveVideoTimestamps,
  type TimestampWithVideoId,
} from "$lib/supabase/timestamps";
import type { ContentState } from "$lib/state/content.svelte";

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

export async function handleAddVideoTimestamp({
  videoTimestamp,
  session,
  supabase,
}: {
  videoTimestamp: TimestampWithVideoId;
  session: Session | null;
  supabase: SupabaseClient;
}): Promise<{ updatedVideos: Video[]; error?: PostgrestError }> {
  // Save and get back updated video data
  const { videos: updatedVideos, error } = await saveVideoTimestamp({
    videoTimestamp,
    session,
    supabase,
  });

  return { updatedVideos: updatedVideos ?? [], error };
}

export async function handleAddVideoTimestamps({
  videoTimestamps,
  session,
  supabase,
}: {
  videoTimestamps: TimestampWithVideoId[];
  contentState: ContentState;
  session: Session | null;
  supabase: SupabaseClient;
}): Promise<{ updatedVideos: Video[]; error?: PostgrestError }> {
  // Save and get back updated video data
  const { videos: updatedVideos, error } = await saveVideoTimestamps({
    videoTimestamps,
    session,
    supabase,
  });
  invalidate("supabase:db:videos");

  if (error) {
    showNotification("Unable to save timestamp");
  } else if (videoTimestamps.some((vt) => vt.watchedAt)) {
    showNotification("Set as watched");
  }
  return { updatedVideos: updatedVideos ?? [], error };
}

export async function handleDeleteVideosTimestamp({
  videos,
  isContinueVideos,
  supabase,
  session,
}: {
  videos: Video[];
  isContinueVideos?: boolean;
  supabase: SupabaseClient;
  session: Session | null;
}): Promise<{ updatedVideos: Video[]; error?: PostgrestError }> {
  if (!session) {
    goto("/");
    return { updatedVideos: [] };
  }

  const { videos: updatedVideos, error } = await deleteVideoTimestamps({
    videoIds: videos.map((v) => v.id),
    supabase,
    session,
  });
  invalidate("supabase:db:videos");

  if (error) {
    showNotification("Unable to remove video from watchlist.");
  } else {
    showNotification(
      isContinueVideos
        ? "Removed from Continue Watching"
        : "Video progress reset",
    );
  }

  return { updatedVideos: updatedVideos ?? [], error };
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
