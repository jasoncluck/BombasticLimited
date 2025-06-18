<script lang="ts">
  import type { SuperValidated } from "sveltekit-superforms";
  import type { Infer } from "sveltekit-superforms/adapters";
  import type { SignupSchema } from "../schema";
  import SignupForm from "./signup-form.svelte";

  let {
    data,
  }: {
    data: {
      signupForm: SuperValidated<Infer<SignupSchema>>;
    };
  } = $props();

  let currentEmail = $state("");
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24">
    <SignupForm data={{ form: data.signupForm }} bind:currentEmail />
  </div>
</div>
