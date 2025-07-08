import type { SupabaseClient, Session } from "@supabase/supabase-js";
import type { ContentDisplay } from "../content/content";
import type { Database } from "$lib/supabase/database.types";
import { updateProfileContentDisplay } from "$lib/supabase/profiles";
import { invalidateAll } from "$app/navigation";

export async function handleUpdateProfileContentDisplay(props: {
  contentDisplay: ContentDisplay;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  await updateProfileContentDisplay(props);
  invalidateAll();
}
