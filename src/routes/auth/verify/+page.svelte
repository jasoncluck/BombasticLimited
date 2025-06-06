<script lang="ts">
  import Alert from "$lib/components/ui/alert/alert.svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import * as Card from "$lib/components/ui/card";
  import { Loader } from "@lucide/svelte";

  let alertMessage = $state();
  let { data } = $props();
  let { supabase } = $derived(data);
  let email = data.email;
  let loading = $state(false);

  const handleResendCode = async () => {
    loading = true;
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        alertMessage = error?.message;
      } else {
        alertMessage = "Email sent -- check your inbox.";
      }
    } catch (e) {
      console.error("An error occurred during email verification resend.", e);
    }
    loading = false;
  };
</script>

<form method="POST" class="flex justify-center mt-24">
  <Card.Root class="p-6 lg:w-1/3 md:w-1/2">
    <Card.Header class="space-y-1">
      <Card.Title class="text-2xl">Almost done</Card.Title>
    </Card.Header>
    <Card.Content>
      <p>
        Account creation requires email verification. An email has been sent to {email}
        with a link which will create and log you into the new account. Once complete
        this tab can be closed.
      </p>
    </Card.Content>

    <div class="relative">
      <div class="absolute inset-0 flex items-center">
        <span class="w-full border-t"></span>
      </div>
      <div class="relative flex justify-center text-xs uppercase">
        <span class="bg-card text-muted-foreground px-2"
          >Didn't receive an email?</span
        >
      </div>
    </div>
    <Card.Footer class="pt-4">
      <div class="space-y-4">
        <p>Use the button below to send a new verification email.</p>

        {#if loading}
          <Loader class="animate-spin mr-2 w-full" />
        {:else}
          <Button
            class="w-full"
            variant="secondary"
            onclick={handleResendCode}
            disabled={loading}>Resend code</Button
          >
        {/if}

        {#if alertMessage}
          <Alert class="mt-6">
            {alertMessage}
          </Alert>
        {/if}
      </div>
    </Card.Footer>
  </Card.Root>
</form>
