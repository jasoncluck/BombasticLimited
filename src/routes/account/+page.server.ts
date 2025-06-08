import { zod } from "sveltekit-superforms/adapters";
import type { PageServerLoad } from "./$types";
import { accountSchema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals: { session, supabase } }) => {
  if (!session) {
    redirect(303, "/auth")
  }

  return {

    form: await superValidate({ email: session.user.email, username: session.user.user_metadata.display_name }, zod(accountSchema)),
  }
};
