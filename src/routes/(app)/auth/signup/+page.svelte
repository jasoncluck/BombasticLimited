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
    <Alert variant="default" class="mb-6">
      <AlertTriangle class="h-4 w-4" />
      <AlertDescription>
        Bombastic is currently in Beta, accounts may be deleted prior to launch.
      </AlertDescription>
    </Alert>

    <SignupForm data={{ form: data.signupForm, ...data }} />
  </div>
</div>
