import { fail, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "../../search/[query]/[source]/$types";
import { checkIfUsernameIsUnique } from "$lib/supabase/accounts";
import { setFlash, redirect } from "sveltekit-flash-message/server";
import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { usernameSchema } from "../schema";

export const load: PageServerLoad = async ({ locals: { session } }) => {
  const usernameForm = await superValidate(zod(usernameSchema));

  if (!session) {
    redirect(303, "/auth/login");
  }

  return {
    usernameForm,
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, locals: { supabase } }) => {
    console.log("Updating username...");
    const form = await superValidate(request, zod(usernameSchema));
    const { username } = form.data;

    const isUnique = await checkIfUsernameIsUnique({ username, supabase });

    if (!isUnique) {
      setFlash(
        {
          type: "error",
          message: "Username already exists and must be unique.",
        },
        cookies,
      );
      return fail(400, { form });
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        username,
      },
    });

    if (error) {
      setFlash({ type: "error", message: error.message }, cookies);

      // Update this message to differentiate a bit more from 'username'
      if (error.code === "user_already_exists") {
        setFlash(
          { type: "error", message: "Email address already registered." },
          cookies,
        );
      }
      return fail(400, { form });
    } else {
      redirect(
        `/`,
        { type: "success", message: "Account created successfully" },
        cookies,
      );
    }
  },
};
