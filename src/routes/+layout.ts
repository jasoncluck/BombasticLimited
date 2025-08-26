import posthog from 'posthog-js';
import { browser } from '$app/environment';

export const load = async () => {
  if (browser) {
    posthog.init('phc_gaW7HPIk0koi0IJ4iILkFIHZgFVz7wJ7Z0tMuw7KW7g', {
      api_host: 'https://alpine.bombastic.ltd',
      ui_host: 'https://us.posthog.com',
      person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
    });
  }

  return {};
};
