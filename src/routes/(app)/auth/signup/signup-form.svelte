<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Loader } from '@lucide/svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import { signupSchema, type SignupSchema } from '$lib/schema/auth-schema';
  import { goto } from '$app/navigation';
  import { checkIfUsernameIsUnique } from '$lib/supabase/user-profiles';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import DiscordIcon from '$lib/assets/icons/DiscordIcon.svelte';

  let {
    data,
  }: {
    data: {
      form: SuperValidated<SignupSchema>;
      supabase: SupabaseClient<Database>;
    };
  } = $props();

  const { supabase } = $derived(data);

  const flash = getFlash(page);

  const signupForm = superForm(data.form, {
    validators: zodClient(signupSchema),
    validationMethod: 'onsubmit',
    onUpdated() {
      updateFlash(page);
    },
  });

  let isSubmitting = $state(false);

  const { form: formData, enhance } = signupForm;
  let isUsernameUnique = $state<boolean | null>(null);
  let isCheckingUsername = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const currentUsername = $derived($formData.username);

  $effect(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    isCheckingUsername = false;
    isUsernameUnique = null;

    if (currentUsername && currentUsername.length >= 2) {
      isCheckingUsername = true;

      timeoutId = setTimeout(async () => {
        try {
          const result = await checkIfUsernameIsUnique({
            username: currentUsername,
            supabase,
          });

          if (currentUsername === $formData.username) {
            if (typeof result === 'boolean') {
              isUsernameUnique = result;
            } else {
              isUsernameUnique = false;
            }
          }
        } catch {
          if (currentUsername === $formData.username) {
            isUsernameUnique = false;
          }
        } finally {
          if (currentUsername === $formData.username) {
            isCheckingUsername = false;
          }
        }
      }, 500);
    }
  });

  // Cleanup on component destroy
  onMount(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });
</script>

<Card.Root class="mx-auto w-full max-w-md p-6">
  <Card.Header class="space-y-1">
    <Card.Title class="text-2xl">Create an account</Card.Title>
    <Card.Description>
      Enter your details to create your account
    </Card.Description>
  </Card.Header>

  <form method="POST" action="?/signup" use:enhance>
    <Card.Content class="mb-4 grid gap-4">
      <div class="flex">
        <Button
          onclick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'discord',
            });
            if (error) {
              console.error(error);
            }
          }}
          variant="outline"
          type="button"
          class="flex w-full cursor-pointer items-center justify-center gap-2"
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
            Or create using email
          </span>
        </div>
      </div>

      <Form.Field form={signupForm} name="email">
        <div class="space-y-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Email</Form.Label>
              <Input
                {...props}
                class="w-full"
                bind:value={$formData.email}
                autocomplete="email"
                type="email"
                placeholder="user@example.com"
              />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </div>
      </Form.Field>

      <Form.Field form={signupForm} name="username">
        <div class="space-y-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Username</Form.Label>
              <Input
                {...props}
                class="w-full lowercase"
                bind:value={$formData.username}
              />
            {/snippet}
          </Form.Control>
          <!-- Fixed height container to prevent layout shift -->
          {#if currentUsername && currentUsername.length >= 2}
            {#if isCheckingUsername}
              <p class="text-xs text-gray-400">Checking availability...</p>
            {:else if isUsernameUnique === true}
              <p class="text-xs text-green-300">Username is available</p>
            {:else if isUsernameUnique === false}
              <p class="text-xs text-red-300">Username is not available</p>
            {/if}
          {/if}
          <Form.FieldErrors class="text-xs" />
        </div>
      </Form.Field>

      <Form.Field form={signupForm} name="password">
        <div class="space-y-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Password</Form.Label>
              <Input
                {...props}
                class="w-full"
                bind:value={$formData.password}
                autocomplete="new-password"
                type="password"
              />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </div>
      </Form.Field>

      <Form.Field form={signupForm} name="confirmPassword">
        <div class="space-y-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Confirm Password</Form.Label>
              <Input
                {...props}
                class="w-full"
                bind:value={$formData.confirmPassword}
                autocomplete="new-password"
                type="password"
              />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </div>
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

    <Card.Footer class="grid gap-4">
      <Button
        class="w-full cursor-pointer"
        type="submit"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <Loader class="mr-2 animate-spin" />
        {/if}
        Create account
      </Button>

      <Button
        variant="link"
        type="button"
        class="w-full"
        disabled={isSubmitting}
        onclick={() => {
          goto('/auth/login');
        }}
      >
        Already have an account? Login
      </Button>
    </Card.Footer>
  </form>
</Card.Root>
