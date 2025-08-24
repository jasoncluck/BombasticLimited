<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Loader } from '@lucide/svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Form from '$lib/components/ui/form';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import { page } from '$app/state';
  import { loginSchema, type LoginSchema } from '$lib/schema/auth-schema';
  import { goto } from '$app/navigation';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import DiscordIcon from '$lib/assets/icons/DiscordIcon.svelte';

  let {
    form,
    supabase,
  }: {
    form: SuperValidated<LoginSchema>;
    supabase: SupabaseClient<Database>;
  } = $props();

  const flash = getFlash(page);

  const loginForm = superForm(form, {
    validators: zodClient(loginSchema),
    validationMethod: 'onsubmit',

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

  let isSubmitting = $state(false);

  const { form: formData, enhance } = loginForm;
</script>

<Card.Root class="gap-6 p-6">
  <Card.Header>
    <Card.Title class="text-2xl">Login</Card.Title>
    <Card.Description>Enter your email and password to log in</Card.Description>
  </Card.Header>

  <form method="POST" action="?/login" use:enhance>
    <Card.Content class="grid gap-4">
      <div class="flex">
        <Button
          onclick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: 'discord',
            });
          }}
          variant="outline"
          type="button"
          class="w-full cursor-pointer"
        >
          <DiscordIcon size={20} class="text-[#5865F2]" />
          Discord
        </Button>
      </div>

      <div class="relative">
        <div class="absolute inset-0 flex items-center">
          <span class="w-full border-t"></span>
        </div>
        <div class="relative flex justify-center text-xs uppercase">
          <span class="bg-card text-muted-foreground px-2">
            Or continue with
          </span>
        </div>
      </div>

      <div class="mb-4 flex flex-col gap-4">
        <Form.Field form={loginForm} name="email">
          <div class="flex flex-wrap items-center gap-2">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label class="text-right">Email</Form.Label>
                <Input
                  {...props}
                  class="col-span-3"
                  bind:value={$formData.email}
                  autocomplete="email"
                  type="email"
                  placeholder="user@example.com"
                />
              {/snippet}
            </Form.Control>
          </div>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <Form.Field form={loginForm} name="password">
          <div class=" flex flex-wrap items-center gap-2">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label class="text-right">Password</Form.Label>
                <Input
                  {...props}
                  class="col-span-3"
                  bind:value={$formData.password}
                  autocomplete="current-password"
                  type="password"
                />
              {/snippet}
            </Form.Control>
          </div>
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
      </div>
    </Card.Content>

    <Card.Footer class="grid gap-4">
      <Button
        class="w-full cursor-pointer"
        type="submit"
        data-testid="login-button"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <Loader class="mr-2 animate-spin" />
        {:else}
          Login
        {/if}
      </Button>

      <div class="flex flex-col gap-2">
        <Button
          variant="link"
          type="button"
          class="text-muted-foreground w-full cursor-pointer"
          disabled={isSubmitting}
          onclick={() => {
            goto('/auth/forgot-password');
          }}
        >
          Forgot your password?
        </Button>

        <Button
          variant="link"
          type="button"
          class="w-full cursor-pointer"
          disabled={isSubmitting}
          onclick={() => {
            goto('/auth/signup');
          }}
        >
          Create a new account
        </Button>
      </div>
    </Card.Footer>
  </form>
</Card.Root>
