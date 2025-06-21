import type { Actions } from "@sveltejs/kit";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import { superValidate, fail } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import type { PageServerLoad } from "./$types";
import { signupSchema } from "../schema";
import { checkIfUsernameIsUnique } from "$lib/supabase/accounts";

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
        `/auth/verify?email=${email}`,
        { type: "success", message: "Account created successfully" },
        cookies,
      );
    }
  },

  signupWithDiscord: async ({ locals: { supabase } }) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
    });
    if (error) {
      console.error(error);
    }
    console.log(data);

    return {
      data,
    };
  },
};
