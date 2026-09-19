<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Form from '$lib/components/ui/form';
  import Input from '$lib/components/ui/input/input.svelte';
  import { Loader } from '@lucide/svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
  import {
    confirmSignUpSchema,
    type ConfirmSignUpSchema,
  } from '$lib/schema/auth-schema';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import { page } from '$app/state';

  let { data }: { data: { form: SuperValidated<ConfirmSignUpSchema> } } =
    $props();

  const flash = getFlash(page);

  const confirmForm = superForm(data.form, {
    validators: zodClient(confirmSignUpSchema),
    onSubmit() {
      isSubmitting = true;
    },
    onResult(event) {
      if (event.result.type !== 'redirect') {
        isSubmitting = false;
      }
    },
    onUpdated() {
      updateFlash(page);
    },
  });
  const { form: formData, enhance } = confirmForm;

  let isSubmitting = $state(false);
  let isResending = $state(false);
</script>

<div class="mt-24 flex justify-center">
  <Card.Root class="p-6 md:w-xl">
    <Card.Header class="flex flex-col gap-2">
      <Card.Title class="text-2xl">Almost done</Card.Title>
    </Card.Header>
    <Card.Content>
      <p>
        Account creation requires email verification. A code has been sent to
        {$formData.email}. Enter it below to finish creating your account.
      </p>
    </Card.Content>

    <form method="POST" action="?/confirm" use:enhance>
      <Card.Content class="grid gap-4">
        <Form.Field form={confirmForm} name="email">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Email</Form.Label>
              <Input {...props} bind:value={$formData.email} type="email" />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <Form.Field form={confirmForm} name="code">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Verification code</Form.Label>
              <Input {...props} bind:value={$formData.code} autocomplete="one-time-code" />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        {#if $flash?.message && $flash?.type}
          <Alert.Root>
            <Alert.Title
              >{$flash.type === 'error' ? 'Error' : 'Success'}</Alert.Title
            >
            <Alert.Description>{$flash.message}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>

      <Card.Footer class="flex flex-col gap-4">
        <Button class="w-full cursor-pointer" type="submit" disabled={isSubmitting}>
          {#if isSubmitting}
            <Loader class="mr-2 animate-spin" />
          {/if}
          Verify account
        </Button>
      </Card.Footer>
    </form>

    <div class="relative">
      <div class="absolute inset-0 flex items-center">
        <span class="w-full border-t"></span>
      </div>
      <div class="relative flex justify-center text-xs uppercase">
        <span class="bg-card text-muted-foreground px-2"
          >Didn't receive a code?</span
        >
      </div>
    </div>
    <Card.Footer class="flex items-center justify-center">
      <form
        method="POST"
        action="?/resend"
        use:enhance
        class="flex w-full flex-col gap-4"
      >
        <input type="hidden" name="email" value={$formData.email} />
        <p class="self-start">
          Check your inbox or spam folder for an email from admin@bombastic.ltd.
          If it's still not there you can request another code.
        </p>
        <Button
          class="w-full"
          variant="secondary"
          type="submit"
          onclick={() => (isResending = true)}
          disabled={isResending}
        >
          {#if isResending}
            <Loader class="mr-2 w-full animate-spin" />
          {:else}
            Resend code
          {/if}
        </Button>
      </form>
    </Card.Footer>
  </Card.Root>
</div>
