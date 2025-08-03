<script lang="ts">
  import type { SuperValidated } from 'sveltekit-superforms';
  import type { Infer } from 'sveltekit-superforms/adapters';
  import type { SignupSchema } from '../schema';
  import SignupForm from './signup-form.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';

  let {
    data,
  }: {
    data: {
      signupForm: SuperValidated<Infer<SignupSchema>>;
      supabase: SupabaseClient<Database>;
    };
  } = $props();
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    <SignupForm data={{ form: data.signupForm, ...data }} />
  </div>
</div>
