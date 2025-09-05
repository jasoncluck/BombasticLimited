import { type Actions } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { passwordConfirmationSchema } from '$lib/schema/auth-schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(passwordConfirmationSchema));

  return {
    form,
  };
};

export const actions: Actions = {
  updatePassword: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(passwordConfirmationSchema));

    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (!claimsData?.claims || claimsError) {
      throw new Error(`Could not find valid claims for user`);
    }

    const { error } = await supabase.auth.updateUser({
      password: form.data.password,
    });
    if (error) {
      setFlash(
        { type: 'error', message: error.message, field: 'password' },
        cookies
      );
      console.error(error);
      return fail(400, { form });
    } else {
      setFlash(
        {
          type: 'success',
          message: `Password updated successfully`,
          field: 'password',
        },
        cookies
      );
      return {
        form,
      };
    }
  },
};
