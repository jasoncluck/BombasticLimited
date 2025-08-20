import { serve } from 'inngest/sveltekit';
import { inngest } from '$lib/inngest/client';
import { imageFunctions } from '$lib/inngest/async-image-processing';

// Serve Inngest functions via SvelteKit API endpoint
const inngestServe = serve({ client: inngest, functions: imageFunctions });
export const GET = inngestServe.GET;
export const POST = inngestServe.POST;
export const PUT = inngestServe.PUT;
