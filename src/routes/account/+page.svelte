<script lang="ts">
  import * as Form from "$lib/components/ui/form";
  import Input from "$lib/components/ui/input/input.svelte";
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import { zodClient, type Infer } from "sveltekit-superforms/adapters";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import {
    emailSchema,
    usernameSchema,
    type EmailSchema,
    type UsernameSchema,
  } from "../auth/schema";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import Button, {
    buttonVariants,
  } from "$lib/components/ui/button/button.svelte";
  import { getFlash, updateFlash } from "sveltekit-flash-message";
  import { page } from "$app/state";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import {
    checkIfUsernameIsUnique,
    type UserProfile,
  } from "$lib/supabase/user-profiles";
  import type { Database } from "$lib/supabase/database.types";
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  import Label from "$lib/components/ui/label/label.svelte";
  import {
    ChevronDown,
    ChevronUp,
    GalleryHorizontal,
    Table,
  } from "@lucide/svelte";
  import { handleUpdateProfileContentDisplay } from "$lib/components/profile/profile-service";

  let {
    data,
  }: {
    data: {
      profile: UserProfile;
      emailForm: SuperValidated<Infer<EmailSchema>>;
      usernameForm: SuperValidated<Infer<UsernameSchema>>;
      supabase: SupabaseClient<Database>;
      session: Session;
    };
  } = $props();

  const { profile, supabase, session } = $derived(data);

  let contentDisplayOpen = $state(false);

  const flash = getFlash(page);

  const emailForm = superForm(data.emailForm, {
    validators: zodClient(emailSchema),
    resetForm: false,

    onChange() {},
    onUpdated() {
      updateFlash(page);
    },
  });

  const usernameForm = superForm(data.usernameForm, {
    validators: zodClient(usernameSchema),
    resetForm: false,
    onUpdated() {
      updateFlash(page);
    },
  });

  const { form: emailFormData, enhance: emailEnhance } = emailForm;
  const { form: usernameFormData, enhance: usernameEnhance } = usernameForm;
  let isUsernameUnique = $state<boolean | null>(null);
  let isCheckingUsername = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const currentUsername = $derived($usernameFormData.username);

  $effect(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    isCheckingUsername = false;
    isUsernameUnique = null;

    if (
      currentUsername &&
      currentUsername !== profile.username &&
      currentUsername.length >= 2
    ) {
      isCheckingUsername = true;

      timeoutId = setTimeout(async () => {
        try {
          const result = await checkIfUsernameIsUnique({
            username: currentUsername,
            supabase,
          });

          if (currentUsername === $usernameFormData.username) {
            if (typeof result === "boolean") {
              isUsernameUnique = result;
            } else {
              isUsernameUnique = false;
            }
          }
        } catch {
          if (currentUsername === $usernameFormData.username) {
            isUsernameUnique = false;
          }
        } finally {
          if (currentUsername === $usernameFormData.username) {
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

<div class="flex flex-row justify-center m-4">
  <div class="flex flex-col gap-4 max-w-[500px]">
    <h1 class="header-primary">Account Settings</h1>
    <form use:emailEnhance method="POST" action="?/updateEmail">
      <Form.Field form={emailForm} name="email">
        <div class="flex flex-wrap @lg:flex-nowrap items-center gap-4 w-full">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="min-w-20">Email</Form.Label>
              <Input
                {...props}
                class="flex-1 min-w-[300px]"
                bind:value={$emailFormData.email}
              />
              <Button
                type="submit"
                variant="secondary"
                class="cursor-pointer @lg:max-w-24 w-full"
                disabled={$emailFormData.email === session.user.email}
              >
                Update
              </Button>
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
    </form>
    {#if $flash?.field === "email" && $flash?.message && $flash?.type}
      <Alert.Root>
        <Alert.Title
          >{$flash.type === "error"
            ? "Error"
            : "Email verification required"}</Alert.Title
        >
        <Alert.Description>{$flash.message}</Alert.Description>
      </Alert.Root>
    {/if}
    <form use:usernameEnhance method="POST" action="?/updateUsername">
      <Form.Field form={usernameForm} name="username">
        <div class="flex flex-wrap @lg:flex-nowrap items-center gap-4 w-full">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="min-w-20">Username</Form.Label>
              <Input
                {...props}
                class="flex-1 min-w-[300px] lowercase"
                bind:value={$usernameFormData.username}
              />
              <!-- Button and status messages for smaller viewports -->
              <div class="flex flex-col-reverse w-full @lg:hidden">
                <Button
                  type="submit"
                  variant="secondary"
                  class="cursor-pointer mt-3 w-full"
                  disabled={$usernameFormData.username === profile.username ||
                    isCheckingUsername ||
                    isUsernameUnique === false}
                >
                  Update
                </Button>
                {#if currentUsername && currentUsername.length >= 2}
                  {#if isCheckingUsername}
                    <p class="text-xs text-gray-400">
                      Checking availability...
                    </p>
                  {:else if isUsernameUnique === true}
                    <p class="text-xs text-green-300">Username is available</p>
                  {:else if isUsernameUnique === false}
                    <p class="text-xs text-red-300">
                      Username is not available
                    </p>
                  {/if}
                {/if}
              </div>
              <Button
                type="submit"
                variant="secondary"
                class="cursor-pointer max-w-24 w-full hidden @lg:block"
                disabled={$usernameFormData.username === profile.username ||
                  isCheckingUsername ||
                  isUsernameUnique === false}
              >
                Update
              </Button>
            {/snippet}
          </Form.Control>
          <Form.FieldErrors />
        </div>
        <!-- Status messages below the main row for larger viewports -->
        <div class="hidden @lg:block mt-2">
          {#if currentUsername && currentUsername.length >= 2}
            {#if isCheckingUsername}
              <p class="text-xs text-gray-400">Checking availability...</p>
            {:else if isUsernameUnique === true}
              <p class="text-xs text-green-300">Username is available</p>
            {:else if isUsernameUnique === false}
              <p class="text-xs text-red-300">Username is not available</p>
            {/if}
          {/if}
        </div>
        {#if $flash?.field === "username" && $flash?.message && $flash?.type}
          <Alert.Root>
            <Alert.Title
              >{$flash.type === "error"
                ? "Error"
                : "Updated username"}</Alert.Title
            >
            <Alert.Description>{$flash.message}</Alert.Description>
          </Alert.Root>
        {/if}
      </Form.Field>
    </form>
    <form
      use:enhance={() => {
        return async () => {
          await updateFlash(page);
        };
      }}
      method="POST"
      action="?/resetPassword"
    >
      <div class="flex flex-wrap @lg:flex-nowrap items-center gap-4 w-full">
        <Label for="password" class="min-w-20">Password</Label>
        <Button
          id="password"
          variant="secondary"
          class="cursor-pointer @lg:w-auto w-full"
          type="submit">Reset Password</Button
        >
      </div>
    </form>
    {#if $flash?.field === "password" && $flash?.message && $flash?.type}
      <Alert.Root>
        <Alert.Title
          >{$flash.type === "error" ? "Error" : "Reset password"}</Alert.Title
        >
        <Alert.Description>{$flash.message}</Alert.Description>
      </Alert.Root>
    {/if}

    <Dialog.Root>
      <Dialog.Trigger
        class="@lg:w-[200px] w-full mt-20 {buttonVariants({
          variant: 'destructive',
        })}">Delete Account</Dialog.Trigger
      >
      <Dialog.Content>
        <form use:enhance method="POST" action="?/deleteAccount">
          <Dialog.Header class="mb-4">
            <Dialog.Title>Delete Account</Dialog.Title>
          </Dialog.Header>

          <p class="mb-8">
            This action cannot be undone. Deleting your account will delete all
            associated data including any public playlists.
          </p>
          <Dialog.Footer>
            <Dialog.Close>
              <Button
                class="cursor-pointer"
                variant="secondary"
                type="button"
                onclick={(e) => {
                  e.preventDefault();
                }}>Cancel</Button
              >
            </Dialog.Close>
            <Button class="cursor-pointer" variant="destructive" type="submit"
              >Delete Account</Button
            ></Dialog.Footer
          >
        </form>
        {#if $flash?.field === "delete" && $flash?.message && $flash?.type}
          <Alert.Root>
            <Alert.Title>Unable to delete account</Alert.Title>
            <Alert.Description>{$flash.message}</Alert.Description>
          </Alert.Root>
        {/if}
      </Dialog.Content>
    </Dialog.Root>
  </div>
</div>
