import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function isUsernameUnique({
  username,
  supabase,
}: {
  username: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: isUnique } = await supabase.rpc("check_unique_username", {
    p_username: username,
  });

  console.log(isUnique);
  return isUnique;
}
