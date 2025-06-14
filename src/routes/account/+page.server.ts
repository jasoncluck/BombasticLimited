import { zod } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { fail, superValidate } from "sveltekit-superforms";
import { emailSchema, passwordSchema, usernameSchema } from "../auth/schema";
import { redirect, setFlash } from "sveltekit-flash-message/server";

export const load: PageServerLoad = async ({ locals: { session } }) => {
  if (!session) {
    redirect(303, "/auth");
  }
  console.log(session.user.user_metadata);

  return {
    emailForm: await superValidate(
      { email: session.user.email },
      zod(emailSchema),
      {
        errors: true,
      },
    ),
    usernameForm: await superValidate(
      { username: session.user.user_metadata.username },
      zod(usernameSchema),
      {
        errors: false,
      },
    ),
    passwordForm: await superValidate(zod(passwordSchema), {
      errors: false,
    }),
  };
};

export const actions: Actions = {
  updateEmail: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(emailSchema));
    const { email } = form.data;

    const { data, error } = await supabase.auth.updateUser(
      {
        email: email,
      },
      { emailRedirectTo: "http://localhost:5173/auth/confirm" },
    );

    if (error) {
      setFlash({ type: "error", message: error.message }, cookies);
      console.log(error);
      return fail(400, { form });
    } else {
      console.log(data);
      return {
        form,
      };
    }
  },
};
