import { fail, redirect } from "@sveltejs/kit";

import type { Actions } from "./$types";

export const actions: Actions = {
  signup: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return fail(400, { code: error.code, message: error.message, email });
    } else {
      redirect(303, `/auth/verify?email=${email}`);
    }
  },
  login: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error(error);
      if (error.code === "email_not_confirmed") {
        await supabase.auth.resend({
          type: "signup",
          email,
        });
        redirect(303, `/auth/verify?email=${email}`);
      }
      return fail(400, { code: error.code, message: error.message, email });
    } else {
      redirect(303, "/");
    }
  },
};
