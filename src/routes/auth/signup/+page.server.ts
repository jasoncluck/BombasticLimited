import type { Actions } from "@sveltejs/kit";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import { superValidate, fail } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import type { PageServerLoad } from "./$types";
import { signupSchema } from "../schema";
import { checkIfUsernameIsUnique } from "$lib/supabase/accounts";
import { updateFlash } from "sveltekit-flash-message";

export const load: PageServerLoad = async ({
  cookies,
  locals: { session },
}) => {
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
    console.log(email, username, password);

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

      if (error.code === "user_already_exists") {
        setFlash(
          { type: "error", message: "Email address already registered." },
          cookies,
        );
      }
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
