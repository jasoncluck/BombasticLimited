import { type Actions } from "@sveltejs/kit";
import { fail, superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { loginSchema } from "../schema";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { session } }) => {
  const loginForm = await superValidate(zod(loginSchema));

  if (session) {
    redirect(303, "/");
  }

  return {
    loginForm,
  };
};

export const actions: Actions = {
  login: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(loginSchema));
    const { email, password } = form.data;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.code === "email_not_confirmed") {
        await supabase.auth.resend({
          type: "signup",
          email,
        });

        redirect(
          `/auth/verify?email=${email}`,
          {
            type: "success",
            message: "Account verification needed",
          },
          cookies,
        );
      }

      setFlash({ type: "error", message: error.message }, cookies);
      return fail(400, { form });
    } else {
      redirect(303, "/");
    }
  },
};
