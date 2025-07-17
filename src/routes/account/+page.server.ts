import { zod } from "sveltekit-superforms/adapters";
import { fail, superValidate } from "sveltekit-superforms";
import { emailSchema, passwordSchema, usernameSchema } from "../auth/schema";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import {
  checkIfUsernameIsUnique,
  getUserProfile,
} from "$lib/supabase/user-profiles";
import type { Actions, PageServerLoad } from "./$types";
import { Filter } from "bad-words";

export const load: PageServerLoad = async ({
  depends,
  locals: { supabase, session },
}) => {
  depends("supabase:db:profiles");
  if (!session) {
    redirect(303, "/auth/login");
  }

  // Run profile fetch and form validations in parallel
  const [{ profile }, emailForm, passwordForm] = await Promise.all([
    getUserProfile({
      supabase,
      userId: session.user.id,
    }),
    superValidate({ email: session.user.email }, zod(emailSchema), {
      errors: true,
    }),
    superValidate(zod(passwordSchema), {
      errors: false,
    }),
  ]);

  // Username form depends on profile data, so it runs after the parallel operations
  const usernameForm = await superValidate(
    { username: profile?.username ?? "" },
    zod(usernameSchema),
    {
      errors: false,
    },
  );

  return {
    profile,
    emailForm,
    usernameForm,
    passwordForm,
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

    // Run username uniqueness check and profanity filter in parallel
    const [isUnique, filter] = await Promise.all([
      checkIfUsernameIsUnique({ username, supabase }),
      Promise.resolve(new Filter()), // Wrap in Promise.resolve for consistency
    ]);

    if (filter.isProfane(username)) {
      setFlash(
        {
          type: "error",
          message:
            "Offensisve langage detected in username, choose another name.",
          field: "username",
        },
        cookies,
      );
      return fail(400, { form });
    }

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

    const { error } = await supabase.auth.updateUser({
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
          message: `Updated username to ${username}`,
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
