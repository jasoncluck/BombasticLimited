import { type Actions } from "@sveltejs/kit";
import { setFlash } from "sveltekit-flash-message/server";
import { fail, superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { passwordSchema } from "../../schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(passwordSchema));

  return {
    form,
  };
};

export const actions: Actions = {
  updatePassword: async ({
    request,
    cookies,
    locals: { supabase, session },
  }) => {
    const form = await superValidate(request, zod(passwordSchema));

    if (!session || !session.user.email) {
      throw new Error(`Could not find email for account: ${session?.user.id}`);
    }

    const { error } = await supabase.auth.updateUser({
      password: form.data.password,
    });
    if (error) {
      setFlash(
        { type: "error", message: error.message, field: "password" },
        cookies,
      );
      console.error(error);
      return fail(400, { form });
    } else {
      setFlash(
        {
          type: "success",
          message: `Password updated successfully`,
          field: "password",
        },
        cookies,
      );
      return {
        form,
      };
    }
  },
};
