<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Loader } from '@lucide/svelte';

  let alertMessage = $state();
  let { data } = $props();
  let { supabase } = $derived(data);
  let email = data.email;
  let loading = $state(false);

  const handleResendCode = async () => {
    loading = true;
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) {
        alertMessage = error?.message;
      } else {
        alertMessage = 'Email sent -- check your inbox.';
      }
    } catch (e) {
      console.error('An error occurred during email verification resend.', e);
    }
    loading = false;
  };
</script>

<form method="POST" class="mt-24 flex justify-center">
  <Card.Root class="p-6 md:w-xl">
    <Card.Header class="flex flex-col gap-2">
      <Card.Title class="text-2xl">Almost done</Card.Title>
    </Card.Header>
    <Card.Content>
      <p>
        Account creation requires email verification. An email has been sent to {email}
        with a link which will create your account and login. Once complete this
        tab can be closed.
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
    <Card.Footer class="flex items-center justify-center">
      <div class="flex flex-col gap-4">
        <p class="self-start">
          Check your inbox or spam folder for an email from admin@bombastic.ltd.
          If it's still not there you can request another code.
        </p>

        {#if loading}
          <Loader class="mr-2 w-full animate-spin" />
        {:else}
          <Button
            class="w-full"
            variant="secondary"
            onclick={handleResendCode}
            disabled={loading}>Resend code</Button
          >
        {/if}

        {#if alertMessage}
          <Alert.Root>
            <Alert.Title>Verification Code</Alert.Title>
            <Alert.Description>
              {alertMessage}
            </Alert.Description>
          </Alert.Root>
        {/if}
      </div>
    </Card.Footer>
  </Card.Root>
</form>
