import posthog from 'posthog-js';
import { browser } from '$app/environment';

export const load = async () => {
  if (browser) {
    posthog.init('phc_gaW7HPIk0koi0IJ4iILkFIHZgFVz7wJ7Z0tMuw7KW7g', {
      api_host: 'https://alpine.bombastic.ltd',
      ui_host: 'https://us.posthog.com',
      cookieless_mode: 'always',

      // Enable error tracking features
      capture_pageview: true,
      capture_pageleave: true,

      // Session recording (optional - helps with debugging)
      session_recording: {
        maskAllInputs: true,
      },
    });
  }

  return {};
};
