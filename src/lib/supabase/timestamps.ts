import type {
  SupabaseClient,
  Session,
  PostgrestError,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type TimestampWithVideoId = {
  videoId: string;
  timestampStartSeconds?: number;
  watchedAt?: Date;
  playlistId?: number;
};

export async function saveVideoTimestamps({
  videoTimestamps,
  supabase,
  session,
}: {
  videoTimestamps: TimestampWithVideoId[];
  supabase: SupabaseClient;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session && videoTimestamps.length > 0) {
    const video_ids = videoTimestamps.map((v) => v.videoId);

    const video_start_seconds = videoTimestamps.map((v) =>
      v.timestampStartSeconds !== undefined ? v.timestampStartSeconds : null,
    );

    const watched_at = videoTimestamps.map((v) =>
      v.watchedAt ? v.watchedAt.toISOString() : null,
    );

    const playlistIds = videoTimestamps.map((v) =>
      v.playlistId ? v.playlistId : null,
    );

    const { data: videos, error: upsertError } = await supabase
      .rpc("insert_timestamps", {
        p_user_id: session.user.id,
        p_video_ids: video_ids,
        p_video_start_seconds: video_start_seconds,
        p_watched_at: watched_at,
        p_playlist_ids: playlistIds,
      })
      .select();

    if (upsertError) {
      console.error("Error saving video timestamps.", upsertError);
      error = upsertError;
    }
    return { videos, error };
  }

  return { videos: [], error };
}

export async function deleteVideoTimestamps({
  videoIds,
  supabase,
  session,
}: {
  videoIds: string[];
  supabase: SupabaseClient;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session?.user && videoIds.length > 0) {
    const { data: videos, error: deleteError } = await supabase
      .rpc("delete_timestamps", {
        p_user_id: session.user.id,
        p_video_ids: videoIds,
      })
      .select();

    if (deleteError) {
      console.error("Error deleting video timestamps.", deleteError);
      error = deleteError;
    }
    return { videos, error };
  }

  return { error };
}

export async function getLatestTimestamp({
  videoId,
  supabase,
  session,
}: {
  videoId: string;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session?.user && videoId) {
    const { data: videoTimestamp, error } = await supabase
      .from("timestamps")
      .select()
      .eq("user_id", session.user.id)
      .eq("video_id", videoId)
      .single();
    if (error) {
      console.error("Error getting latest timestamp:", error);
    }
    return { videoTimestamp, error };
  }
  return { error };
}
