import { fail } from "@sveltejs/kit";

import { redirect, setFlash } from 'sveltekit-flash-message/server';
import type { Actions, PageServerLoad } from "./$types";
import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { loginSchema, signupSchema } from "./schema";

export const load: PageServerLoad = async () => {
  const loginForm = await superValidate(zod(loginSchema));
  const signupForm = await superValidate(zod(signupSchema));

  return {
    loginForm,
    signupForm
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
        }
      }
    });

    if (error) {
      setFlash({ type: 'error', message: error.message }, cookies);
      console.log(error)
      return fail(400, { form })
    } else {
      redirect(`/auth/verify?email=${email}`, { type: 'success', message: "Account created successfully" }, cookies);

    }
  },
  login: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(loginSchema));
    if (!form.valid) {
      return fail(400, {
        form,
      });
    }
    const { email, password } = form.data;

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
        redirect(`/auth/verify?email=${email}`, {
          type: 'success', message: "Account verification needed"
        }, cookies);
      }

      setFlash({ type: 'error', message: error.message }, cookies);
      console.log(error)
      return fail(400, { form });
    } else {
      redirect(303, "/");
    }
  },
};
