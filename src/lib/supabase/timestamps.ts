export type TimestampWithVideoId = {
  videoId: string;
  timestampStartSeconds?: number;
  watchedAt?: Date;
};

import type {
  SupabaseClient,
  Session,
  PostgrestError,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function saveVideoTimestamps({
  videoTimestamps,
  supabase,
  session,
}: {
  videoTimestamps: TimestampWithVideoId[];
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session && videoTimestamps.length > 0) {
    // Convert the array to records for upsert
    const timestampRecords = videoTimestamps.map(
      ({ videoId, timestampStartSeconds, watchedAt }) => ({
        user_id: session.user.id,
        video_id: videoId,
        video_start_seconds: timestampStartSeconds,
        watched_at: watchedAt?.toISOString() ?? null,
      }),
    );

    const { data: videos, error: upsertError } = await supabase
      .from("timestamps")
      .upsert(timestampRecords, { onConflict: "user_id,video_id" })
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
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session?.user && videoIds.length > 0) {
    const { data: videos, error: deleteError } = await supabase
      .from("timestamps")
      .delete()
      .eq("user_id", session.user.id)
      .in("video_id", videoIds)
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
