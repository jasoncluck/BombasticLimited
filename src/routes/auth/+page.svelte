<script lang="ts">
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
  let currentEmail = $state("");

  function toggleForm() {
    isLogin = !isLogin;
  }
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24">
    {#if isLogin}
      <LoginForm
        data={{ form: data.loginForm }}
        onToggle={toggleForm}
        bind:currentEmail
      />
    {:else}
      <SignupForm
        data={{ form: data.signupForm }}
        onToggle={toggleForm}
        bind:currentEmail
      />
    {/if}
  </div>
</div>
