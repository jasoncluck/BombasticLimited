<script lang="ts">
  import type { SuperValidated } from 'sveltekit-superforms';
  import type { Infer } from 'sveltekit-superforms/adapters';
  import type { Writable } from 'svelte/store';
  import type { LoginSchema } from '../schema';
  import LoginForm from './login-form.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';

  export type AuthFlash = Writable<{
    message: string | null;
    type: 'error' | 'success' | null;
  }>;

  let {
    data,
  }: {
    data: {
      loginForm: SuperValidated<Infer<LoginSchema>>;

      supabase: SupabaseClient<Database>;
    };
  } = $props();
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    <LoginForm data={{ form: data.loginForm, ...data }} />
  </div>
</div>
