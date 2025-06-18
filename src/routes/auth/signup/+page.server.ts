import type { Actions } from "@sveltejs/kit";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import { superValidate, fail } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import type { PageServerLoad } from "./$types";
import { signupSchema } from "../schema";

export const load: PageServerLoad = async ({ locals: { session } }) => {
  const signupForm = await superValidate(zod(signupSchema));

  if (session) {
    redirect(303, "/");
  }

  return {
    signupForm,
  };
};
export const actions: Actions = {
  signup: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(signupSchema));
    const { email, username, password } = form.data;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (error) {
      setFlash({ type: "error", message: error.message }, cookies);
      console.log(error);
      return fail(400, { form });
    } else {
      redirect(
        `/auth/verify?email=${email}`,
        { type: "success", message: "Account created successfully" },
        cookies,
      );
    }
  },
};
