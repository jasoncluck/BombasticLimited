import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "./database.types";

export type Profile = Tables<"profiles">;

export async function checkIfUsernameIsUnique({
  username,
  supabase,
}: {
  username: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: isUnique } = await supabase.rpc("is_unique_username", {
    p_username: username,
  });

  return isUnique;
}

export async function getUserProfile({
  userId,
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select()
    .eq("id", userId)
    .single();

  if (error) {
    console.error(error);
  }
  return { profile, error };
}

export async function getProfile({
  session,
  supabase,
}: {
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {

  if (!session) {
    return { profile: null, error: null };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error(error);
  }
  return { profile, error };
}
