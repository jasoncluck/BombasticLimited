import { zod } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { fail, superValidate } from "sveltekit-superforms";
import { emailSchema, passwordSchema, usernameSchema } from "../auth/schema";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import { checkIfUsernameIsUnique } from "$lib/supabase/accounts";

export const load: PageServerLoad = async ({ locals: { session } }) => {
  if (!session) {
    redirect(303, "/auth/login");
  }

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
  updateEmail: async ({ url, request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(emailSchema));
    const { email } = form.data;

    const { data, error } = await supabase.auth.updateUser(
      {
        email: email,
      },
      { emailRedirectTo: `${url.origin}/auth/email/confirm` },
    );

    if (error) {
      setFlash(
        { type: "error", message: error.message, field: "email" },
        cookies,
      );

      // Update this message to differentiate a bit more from 'username'
      if (error.code === "user_already_exists") {
        setFlash(
          { type: "error", message: "Email address already registered." },
          cookies,
        );
      }

      console.error(error);
      return fail(400, { form });
    } else {
      setFlash(
        {
          type: "success",
          message: `Emails with confirmation links have sent to both the new email: ${data.user.new_email} and the current email ${data.user.email}. The email will be updated once both links have been confirmed. `,
          field: "email",
        },
        cookies,
      );
      return {
        form,
      };
    }
  },

  updateUsername: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(usernameSchema));
    const { username } = form.data;

    const isUnique = await checkIfUsernameIsUnique({ username, supabase });

    if (!isUnique) {
      setFlash(
        {
          type: "error",
          message: "Username already exists and must be unique.",
          field: "username",
        },
        cookies,
      );
      return fail(400, { form });
    }

    const { data, error } = await supabase.auth.updateUser({
      data: { username },
    });

    if (error) {
      setFlash(
        { type: "error", message: error.message, field: "username" },
        cookies,
      );
      console.error(error);
      return fail(400, { form });
    } else {
      setFlash(
        {
          type: "success",
          message: `Updated username to ${data.user.user_metadata.username}`,
          field: "username",
        },
        cookies,
      );
      return {
        form,
      };
    }
  },

  resetPassword: async ({ cookies, locals: { supabase, session } }) => {
    if (!session || !session.user.email) {
      throw new Error(`Could not find email for account: ${session?.user.id}`);
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      session.user.email,
      { redirectTo: `/auth/password/update` },
    );
    if (error) {
      setFlash(
        { type: "error", message: error.message, field: "password" },
        cookies,
      );
      return fail(400);
    } else {
      setFlash(
        {
          type: "success",
          message: `Password reset email sent to ${session.user.email}.`,
          field: "password",
        },
        cookies,
      );
    }
  },

  deleteAccount: async ({ cookies, locals: { supabase, session } }) => {
    console.log("in delete account");
    if (!session) {
      redirect(303, "/login");
    }

    const { error } = await supabase.rpc("delete_user");

    if (error) {
      setFlash(
        { type: "error", message: error.message, field: "delete" },
        cookies,
      );
      return fail(400);
    } else {
      redirect(303, "/");
    }
  },
};
