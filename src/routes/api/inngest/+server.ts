import { serve } from 'inngest/sveltekit';
import { inngest } from '$lib/inngest/client';
import { imageFunctions } from '$lib/inngest/image-processing';

// Serve Inngest functions via SvelteKit API endpoint
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: imageFunctions,

  // Optional: Configure serving options
  streaming: false,

  // Signing key for production (set via environment variable)
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
