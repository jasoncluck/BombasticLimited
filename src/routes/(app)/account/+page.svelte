<script lang="ts">
  import * as Form from '$lib/components/ui/form';
  import Input from '$lib/components/ui/input/input.svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import {
    emailSchema,
    usernameSchema,
    type EmailSchema,
    type UsernameSchema,
  } from '$lib/schema/auth-schema';
  import Button, {
    buttonVariants,
  } from '$lib/components/ui/button/button.svelte';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import { page } from '$app/state';
  import type {
    Session,
    SupabaseClient,
    UserIdentity,
  } from '@supabase/supabase-js';
  import {
    checkIfUsernameIsUnique,
    linkDiscordIdentity,
    unlinkDiscordIdentity,
    type UserProfile,
  } from '$lib/supabase/user-profiles';
  import type { Database } from '$lib/supabase/database.types';
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Avatar from '$lib/components/ui/avatar';
  import DiscordIcon from '$lib/assets/icons/DiscordIcon.svelte';

  import Label from '$lib/components/ui/label/label.svelte';
  import { goto, invalidate } from '$app/navigation';
  import { showNotification } from '$lib/supabase/notifications';

  let {
    data,
  }: {
    data: {
      profile: UserProfile;
      discordIdentity: UserIdentity;
      emailForm: SuperValidated<EmailSchema>;
      usernameForm: SuperValidated<UsernameSchema>;
      supabase: SupabaseClient<Database>;
      session: Session;
    };
  } = $props();

  const { profile, discordIdentity, supabase, session } = $derived(data);

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

  const hashParams = parseHashParams(page.url.hash);

  const errorCode = hashParams.get('error_code');
  const errorDescription = hashParams.get('error_description');

  let errorTitle = $state<string | undefined>();

  switch (errorCode) {
    case 'identity_already_exists':
      errorTitle = 'Unable to link Discord account';
      break;
    default:
  }

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
            if (typeof result === 'boolean') {
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

  // Cleanup on component destroy and handle OAuth returns
  onMount(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });

  function parseHashParams(hash: string): URLSearchParams {
    // Remove the leading # and parse as URLSearchParams
    const hashWithoutFragment = hash.startsWith('#') ? hash.slice(1) : hash;
    return new URLSearchParams(hashWithoutFragment);
  }
</script>

<div class="m-4 mx-auto flex flex-col justify-center">
  <div class="flex max-w-[500px] flex-col gap-4">
    <h1 class="header-primary">Account Settings</h1>
    <form use:emailEnhance method="POST" action="?/updateEmail">
      <Form.Field form={emailForm} name="email">
        <div class="flex w-full flex-wrap items-center gap-4 @lg:flex-nowrap">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="min-w-20">Email</Form.Label>
              <Input
                {...props}
                class="min-w-[300px] flex-1"
                bind:value={$emailFormData.email}
              />
              <Button
                type="submit"
                variant="secondary"
                class="w-full cursor-pointer @lg:max-w-24"
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
    {#if $flash?.field === 'email' && $flash?.message && $flash?.type}
      <Alert.Root>
        <Alert.Title
          >{$flash.type === 'error'
            ? 'Error'
            : 'Email verification required'}</Alert.Title
        >
        <Alert.Description>{$flash.message}</Alert.Description>
      </Alert.Root>
    {/if}
    <form use:usernameEnhance method="POST" action="?/updateUsername">
      <Form.Field form={usernameForm} name="username">
        <div class="flex w-full flex-wrap items-center gap-4 @lg:flex-nowrap">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="min-w-20">Username</Form.Label>
              <Input
                {...props}
                class="min-w-[300px] flex-1 lowercase"
                bind:value={$usernameFormData.username}
              />
              <!-- Button and status messages for smaller viewports -->
              <div class="flex w-full flex-col-reverse @lg:hidden">
                <Button
                  type="submit"
                  variant="secondary"
                  class="mt-3 w-full cursor-pointer"
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
                class="hidden w-full max-w-24 cursor-pointer @lg:block"
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
        <div class="mt-2 hidden @lg:block">
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
        {#if $flash?.field === 'username' && $flash?.message && $flash?.type}
          <Alert.Root>
            <Alert.Title
              >{$flash.type === 'error'
                ? 'Error'
                : 'Updated username'}</Alert.Title
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
      <div class="flex w-full flex-wrap items-center gap-4 @lg:flex-nowrap">
        <Label for="password" class="min-w-20">Password</Label>
        <Button
          id="password"
          variant="secondary"
          class="w-full cursor-pointer @lg:w-auto"
          type="submit">Reset Password</Button
        >
      </div>
    </form>
    {#if $flash?.field === 'password' && $flash?.message && $flash?.type}
      <Alert.Root>
        <Alert.Title
          >{$flash.type === 'error' ? 'Error' : 'Reset password'}</Alert.Title
        >
        <Alert.Description>{$flash.message}</Alert.Description>
      </Alert.Root>
    {/if}

    <!-- Discord Account Linking Section -->
    <div class="mt-8 border-t pt-8">
      <h2 class="mb-4 text-lg font-semibold">Linked Accounts</h2>

      {#if discordIdentity}
        <!-- Discord Account Linked -->
        <div class="flex w-full flex-wrap items-center gap-4 @lg:flex-nowrap">
          <Label class="min-w-20">Discord</Label>
          <div
            class="border-input bg-background flex max-w-[300px] min-w-[200px] flex-1 items-center gap-3 rounded-md border px-3 py-2"
          >
            {#if profile.avatar_url}
              <Avatar.Root class="h-8 w-8">
                <Avatar.Image src={profile.avatar_url} alt="Discord avatar" />
                <Avatar.Fallback>
                  <DiscordIcon size={16} class="text-[#5865F2]" />
                </Avatar.Fallback>
              </Avatar.Root>
            {:else}
              <DiscordIcon size={20} class="text-[#5865F2]" />
            {/if}
            <div class="flex-1">
              <p class="text-sm font-medium">
                {discordIdentity.identity_data?.full_name ||
                  discordIdentity.identity_data?.username ||
                  'Discord User'}
              </p>
              <p class="text-muted-foreground text-xs">Account linked</p>
            </div>
          </div>
          {#if profile.providers.length > 1}
            <Button
              type="submit"
              variant="destructive"
              class="w-full cursor-pointer @lg:w-auto"
              onclick={async (e) => {
                e.preventDefault();
                const { error } = await unlinkDiscordIdentity({
                  supabase,
                });

                if (error) {
                  showNotification(error.message, 'error');
                }
                invalidate('supabase:db:profiles');
              }}
            >
              Unlink
            </Button>
          {/if}
        </div>
      {:else}
        <!-- Discord Account Not Linked -->
        <div class="flex w-full flex-wrap items-center gap-4 @lg:flex-nowrap">
          <Label class="min-w-20">Discord</Label>
          <div
            class="border-input bg-background text-muted-foreground flex min-w-[300px] flex-1 items-center gap-3 rounded-md border px-3 py-2"
          >
            <DiscordIcon size={20} class="text-[#5865F2]" />
            <span class="text-sm">No Discord account linked</span>
          </div>
          <Button
            type="submit"
            variant="secondary"
            class="w-full cursor-pointer @lg:w-auto"
            onclick={async (e) => {
              e.preventDefault();
              const { data, error } = await linkDiscordIdentity({
                supabase,
                redirectTo: `${page.url.origin}/account`,
              });

              if (error) {
                showNotification(error.message, 'error');
              }

              if (data.url) {
                goto(data.url);
              }
            }}
          >
            <DiscordIcon size={16} class="mr-2 text-[#5865F2]" />
            Link Discord
          </Button>
        </div>

        {#if errorTitle || errorDescription}
          <div class="mt-4 flex w-full items-center justify-center">
            <div class="w-[500px]">
              <Alert.Root>
                <Alert.Title>{errorTitle}</Alert.Title>
                <Alert.Description>{errorDescription}</Alert.Description>
              </Alert.Root>
            </div>
          </div>
        {/if}
      {/if}

      {#if $flash?.field === 'discord' && $flash?.message && $flash?.type}
        <Alert.Root class="mt-4">
          <Alert.Title
            >{$flash.type === 'error' ? 'Error' : 'Success'}</Alert.Title
          >
          <Alert.Description>{$flash.message}</Alert.Description>
        </Alert.Root>
      {/if}
    </div>

    <Dialog.Root>
      <Dialog.Trigger
        class="mt-20 w-full @lg:w-[200px] {buttonVariants({
          variant: 'destructive',
        })}">Delete Account</Dialog.Trigger
      >
      <Dialog.Content>
        <form use:enhance method="POST" action="?/deleteAccount">
          <Dialog.Header class="mb-4">
            <Dialog.Title>Delete Account</Dialog.Title>
          </Dialog.Header>

          <p class="mb-8">
            This action cannot be undone. Deleting your account will remove all
            associated data including any playlists.
          </p>
          <Dialog.Footer>
            <Dialog.Close>
              <Button
                class="w-full cursor-pointer sm:w-auto"
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
        {#if $flash?.field === 'delete' && $flash?.message && $flash?.type}
          <Alert.Root>
            <Alert.Title>Unable to delete account</Alert.Title>
            <Alert.Description>{$flash.message}</Alert.Description>
          </Alert.Root>
        {/if}
      </Dialog.Content>
    </Dialog.Root>
  </div>
</div>
