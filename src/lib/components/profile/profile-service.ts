import type { SupabaseClient, Session } from "@supabase/supabase-js";
import type { ContentDisplay } from "../content/content";
import type { Database } from "$lib/supabase/database.types";
import { updateProfileContentDisplay } from "$lib/supabase/profiles";
import { showNotification } from "$lib/stores/notification";
import { invalidate } from "$app/navigation";

export async function handleUpdateProfileContentDisplay(props: {
  contentDisplay: ContentDisplay;
  supabase: SupabaseClient<Database>;
  session: Session | null;

}) {


  const { error } = await updateProfileContentDisplay(props)

  if (error) {
    showNotification("An error occurred when attempting to update content display preferences")
  } else {
    showNotification("Updated content display preferences")
  }

  invalidate("supabase:db:profiles")

}
