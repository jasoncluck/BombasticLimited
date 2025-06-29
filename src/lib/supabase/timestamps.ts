import type {
  SupabaseClient,
  Session,
  PostgrestError,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function saveVideoTimestamp({
  videoId,
  currentTimeSeconds,
  watchedAt,
  supabase,
  session,
}: {
  videoId: string;
  currentTimeSeconds?: number;
  watchedAt: Date | null;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session?.user && videoId) {
    const { error } = await supabase.from("timestamps").upsert(
      {
        user_id: session?.user.id,
        video_id: videoId,
        video_start_seconds: currentTimeSeconds,
        watched_at: watchedAt?.toISOString() ?? null,
      },
      { onConflict: "user_id,video_id" },
    );
    if (error) {
      console.error("Error saving video current timestamp.", error);
    }
  }
  return { error };
}

export async function deleteVideoTimestamp({
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
    const { error } = await supabase
      .from("timestamps")
      .delete()
      .eq("user_id", session.user.id)
      .eq("video_id", videoId);
    if (error) {
      console.error("Error deleting video current timestamp.", error);
    }
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
