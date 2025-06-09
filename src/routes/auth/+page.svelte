<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { getFlash } from "sveltekit-flash-message";
  import { page } from "$app/state";
  import type { SuperValidated } from "sveltekit-superforms";
  import type { Infer } from "sveltekit-superforms/adapters";
  import LoginForm from "./login-form.svelte";
  import SignupForm from "./signup-form.svelte";
  import type { LoginSchema, SignupSchema } from "./schema";
  import type { Writable } from "svelte/store";

  export type AuthFlash = Writable<{
    message: string | null;
    type: "error" | "success" | null;
  }>;

  let {
    data,
  }: {
    data: {
      loginForm: SuperValidated<Infer<LoginSchema>>;
      signupForm: SuperValidated<Infer<SignupSchema>>;
    };
  } = $props();

  let isLogin = $derived(!page.url.searchParams.has("signup"));
  let flash: AuthFlash = $derived(getFlash(page));
  let currentEmail = $state("");

  function toggleForm() {
    isLogin = !isLogin;
  }
  $effect(() => {
    console.log($flash);
  });
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24">
    {#if isLogin}
      <LoginForm
        data={{ form: data.loginForm }}
        onToggle={toggleForm}
        {flash}
        bind:currentEmail
      />
    {:else}
      <SignupForm
        data={{ form: data.signupForm }}
        onToggle={toggleForm}
        {flash}
        bind:currentEmail
      />
    {/if}
  </div>
</div>
