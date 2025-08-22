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
  import {
    forgotPasswordSchema,
    type ForgotPasswordSchema,
  } from '$lib/schema/auth-schema';
  import { goto } from '$app/navigation';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { writable } from 'svelte/store';

  let {
    data,
  }: {
    data: {
      form: SuperValidated<ForgotPasswordSchema>;
      supabase: SupabaseClient<Database>;
    };
  } = $props();

  const flash = getFlash(page);

  // Only initialize superForm if data.form exists
  const forgotPasswordFormHandler = data.form
    ? superForm(data.form, {
        validators: zodClient(forgotPasswordSchema),
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
      })
    : null;

  let isSubmitting = $state(false);

  const { form: formData, enhance } = forgotPasswordFormHandler || {
    form: writable({ email: '' }),
    enhance: (node: HTMLFormElement) => ({ destroy: () => {} }),
  };
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    {#if data.form && forgotPasswordFormHandler}
      <Card.Root class="gap-6 p-6">
        <Card.Header>
          <Card.Title class="text-2xl">Reset Password</Card.Title>
          <Card.Description>
            Enter your email address and we'll send you a link to reset your
            password
          </Card.Description>
        </Card.Header>

        <form method="POST" action="?/resetPassword" use:enhance>
          <Card.Content class="grid gap-4">
            <div class="mb-4 flex flex-col gap-4">
              <Form.Field form={forgotPasswordFormHandler} name="email">
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
                        data-testid="email-input"
                      />
                    {/snippet}
                  </Form.Control>
                </div>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              {#if $flash?.message && $flash?.type}
                <Alert.Root>
                  <Alert.Title
                    >{$flash.type === 'error'
                      ? 'Error'
                      : 'Success'}</Alert.Title
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
              data-testid="reset-password-button"
              disabled={isSubmitting}
            >
              {#if isSubmitting}
                <Loader class="mr-2 animate-spin" />
              {:else}
                Send Reset Email
              {/if}
            </Button>

            <div class="flex flex-col gap-2">
              <Button
                variant="link"
                type="button"
                class="w-full cursor-pointer"
                disabled={isSubmitting}
                onclick={() => {
                  goto('/auth/login');
                }}
              >
                Back to Login
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
    {/if}
  </div>
</div>
