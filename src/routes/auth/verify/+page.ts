import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  const email = url.searchParams.get('email');
  if (email) {
    return {
      email,
    };
  }

  error(400, 'Invalid email.');
};
