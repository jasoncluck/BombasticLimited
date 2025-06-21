<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Loader } from "@lucide/svelte";
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import { zodClient, type Infer } from "sveltekit-superforms/adapters";
  import * as Form from "$lib/components/ui/form";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { getFlash, updateFlash } from "sveltekit-flash-message";
  import { usernameSchema, type UsernameSchema } from "../schema";
  import { checkIfUsernameIsUnique } from "$lib/supabase/accounts";
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";

  let {
    data,
  }: {
    data: {
      form: SuperValidated<Infer<UsernameSchema>>;
      supabase: SupabaseClient<Database>;
    };
  } = $props();

  const { supabase } = $derived(data);

  const flash = getFlash(page);

  const usernameForm = superForm(data.form, {
    validators: zodClient(usernameSchema),
    onUpdated() {
      updateFlash(page);
    },
  });

  let isSubmitting = $state(false);

  const { form: formData, enhance } = usernameForm;
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
            if (typeof result === "boolean") {
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

<form method="POST" use:enhance>
  <Card.Root class="p-6 w-full max-w-md mx-auto">
    <Card.Header class="space-y-1">
      <Card.Title class="text-2xl">Create an account</Card.Title>
      <Card.Description>
        <p>Finish creating your account by selecting a username.</p>
      </Card.Description>
    </Card.Header>

    <Card.Content class="grid gap-4 ">
      <Form.Field form={usernameForm} name="username">
        <div class="space-y-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Username</Form.Label>
              <Input
                {...props}
                class="w-full"
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

      {#if $flash?.message && $flash?.type}
        <Alert.Root>
          <Alert.Title
            >{$flash.type === "error" ? "Error" : "Success"}</Alert.Title
          >
          <Alert.Description>{$flash.message}</Alert.Description>
        </Alert.Root>
      {/if}
    </Card.Content>

    <Card.Footer class="grid gap-4">
      <Button
        class="cursor-pointer w-full"
        type="submit"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <Loader class="animate-spin mr-2" />
        {/if}
        Create Account
      </Button>
    </Card.Footer>
  </Card.Root>
</form>
