<script lang="ts">
  import { page } from '$app/state';

  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Card from '$lib/components/ui/card';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import {
    passwordConfirmationSchema,
    type PasswordConfirmationSchema,
  } from '$lib/schema/auth-schema';
  import type { Database } from '$lib/supabase/database.types';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import * as Form from '$lib/components/ui/form';
  import Input from '$lib/components/ui/input/input.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Loader } from '@lucide/svelte';

  const params = page.url.searchParams;
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  let isSubmitting = $state(false);

  let {
    data,
  }: {
    data: {
      form: SuperValidated<PasswordConfirmationSchema>;
      supabase: SupabaseClient<Database>;
      session: Session;
    };
  } = $props();

  const flash = getFlash(page);

  const form = superForm(data.form, {
    validators: zodClient(passwordConfirmationSchema),

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
  const { form: formData, enhance } = form;
</script>

{#if error}
  <div class="flex w-full items-center justify-center">
    <div class="w-[500px]">
      <Alert.Root>
        <Alert.Title>Unable to reset password</Alert.Title>
        <Alert.Description>{errorDescription}</Alert.Description>
      </Alert.Root>
    </div>
  </div>
{:else}
  <div class="flex flex-row justify-center">
    <div class="mt-24 w-[500px]">
      <Card.Root class="gap-6 p-6">
        <Card.Header>
          <Card.Title class="text-2xl">Update Password</Card.Title>
          <Card.Description
            >Enter your new password and confirm it</Card.Description
          >
        </Card.Header>

        <form method="POST" action="?/updatePassword" use:enhance>
          <Card.Content class="grid gap-4">
            <div class="mb-4 flex flex-col gap-4">
              <Form.Field {form} name="password">
                <div class=" flex flex-wrap items-center gap-2">
                  <Form.Control>
                    {#snippet children({ props })}
                      <Form.Label class="text-right">New Password</Form.Label>
                      <Input
                        {...props}
                        class="col-span-3"
                        bind:value={$formData.password}
                        type="password"
                        autocomplete="new-password"
                      />
                    {/snippet}
                  </Form.Control>
                </div>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <Form.Field {form} name="confirmPassword">
                <div class=" flex flex-wrap items-center gap-2">
                  <Form.Control>
                    {#snippet children({ props })}
                      <Form.Label class="text-right"
                        >Confirm New Password</Form.Label
                      >
                      <Input
                        {...props}
                        class="col-span-3"
                        bind:value={$formData.confirmPassword}
                        type="password"
                        autocomplete="new-password"
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
              disabled={isSubmitting}
            >
              {#if isSubmitting}
                <Loader class="mr-2 animate-spin" />
              {:else}
                Update Password
              {/if}
            </Button>
          </Card.Footer>
        </form>
      </Card.Root>
    </div>
  </div>
{/if}
