<script lang="ts">
  import { Alert } from "$lib/components/ui/alert";
  import { getFlash } from "sveltekit-flash-message";
  import { page } from "$app/state";
  import type { SuperValidated } from "sveltekit-superforms";
  import type { Infer } from "sveltekit-superforms/adapters";
  import LoginForm from "./login-form.svelte";
  import SignupForm from "./signup-form.svelte";
  import type { LoginSchema, SignupSchema } from "./schema";

  let {
    data,
  }: {
    data: {
      loginForm: SuperValidated<Infer<LoginSchema>>;
      signupForm: SuperValidated<Infer<SignupSchema>>;
    };
  } = $props();

  let isLogin = $state(true);
  const flash = $derived(getFlash(page));

  function toggleForm() {
    isLogin = !isLogin;
  }
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24">
    {#if isLogin}
      <LoginForm data={{ form: data.loginForm }} onToggle={toggleForm} />
    {:else}
      <SignupForm data={{ form: data.signupForm }} onToggle={toggleForm} />
    {/if}

    {#if $flash}
      <Alert variant="destructive" class="mt-4">
        {$flash.message}
      </Alert>
    {/if}
  </div>
</div>
