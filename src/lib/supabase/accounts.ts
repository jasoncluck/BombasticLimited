import type { SupabaseClient } from "@supabase/supabase-js";
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
