import type {
  SupabaseClient,
  Session,
  PostgrestError,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function saveVideoTimestamp({
  videoId,
  currentTimeSeconds,
  supabase,
  session,
}: {
  videoId: string;
  currentTimeSeconds: number;
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

export async function savePlaylistVideoTimestamp({
  videoId,
  playlistId,
  currentTimeSeconds,
  supabase,
  session,
}: {
  videoId: string;
  playlistId: number;
  currentTimeSeconds: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  let error: PostgrestError | undefined;

  if (session?.user && videoId) {
    // TODO: Finish implmenattion, need to get user'a playlists and update the timestamp for the specific video
    const { error } = await supabase.from("timestamps").upsert(
      {
        user_id: session?.user.id,
        video_id: videoId,
        video_start_seconds: currentTimeSeconds,
      },
      { onConflict: "user_id,video_id" },
    );
    if (error) {
      console.error("Error saving video current timestamp.", error);
    }
  }
  return { error };
}
