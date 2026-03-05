<script lang="ts">
  import type { SuperValidated } from 'sveltekit-superforms';
  import type { SignupSchema } from '$lib/schema/auth-schema';
  import SignupForm from './signup-form.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { AlertTriangle } from '@lucide/svelte';

  let {
    data,
  }: {
    data: {
      signupForm: SuperValidated<SignupSchema>;
      supabase: SupabaseClient<Database>;
      isBombasticDomain: boolean;
    };
  } = $props();

  // Check if current URL contains bombastic.ltd
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    <SignupForm data={{ form: data.signupForm, ...data }} />

    <div class="flex w-full justify-center">
      <div
        class="text-muted-foreground mx-2 mt-6 w-full max-w-[300px] text-center text-sm"
      >
        By creating an account, you agree to our
        <a
          href="/privacy"
          class="text-primary underline hover:opacity-80"
          target="_blank"
          rel="noopener"
        >
          Privacy Policy
        </a>
        and
        <a
          href="/cookies"
          class="text-primary underline hover:opacity-80"
          target="_blank"
          rel="noopener"
        >
          Cookie Policy
        </a>
      </div>
    </div>
  </div>
</div>
