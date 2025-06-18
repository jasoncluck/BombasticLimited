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
    type PasswordSchema,
    type UsernameSchema,
  } from "../auth/schema";
  import Button from "$lib/components/ui/button/button.svelte";
  import { getFlash } from "sveltekit-flash-message";
  import { page } from "$app/state";
  import type { Session } from "@supabase/supabase-js";

  let {
    data,
  }: {
    data: {
      emailForm: SuperValidated<Infer<EmailSchema>>;
      usernameForm: SuperValidated<Infer<UsernameSchema>>;
      passwordForm: SuperValidated<Infer<PasswordSchema>>;
      session: Session;
    };
  } = $props();

  const { session } = $derived(data);

  const flash = getFlash(page);

  const emailForm = superForm(data.emailForm, {
    validators: zodClient(emailSchema),
    resetForm: false,
    onChange() {},
    onUpdated(event) {
      console.log("in updated");
      console.log(event.form.message);
    },
  });

  const usernameForm = superForm(data.usernameForm, {
    validators: zodClient(usernameSchema),
    resetForm: false,
  });

  const { form: emailFormData, enhance: emailEnhance } = $derived(emailForm);
  const { form: usernameFormData, enhance: usernameEnhance } =
    $derived(usernameForm);
  // TODO: Add change password
  // const { form: passwordFormData, enhance: passwordEnhance } =
  //   $derived(passwordSchema);
  //
</script>

<div class="flex flex-row justify-center">
  <div class="flex flex-col gap-4 max-w-[500px]">
    <h1 class="header-primary">Account settings</h1>
    <form use:emailEnhance method="POST" action="?/updateEmail">
      <Form.Field form={emailForm} name="email">
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="flex w-22">Email</Form.Label>
              <Input
                {...props}
                class="flex-1 min-w-[300px]"
                bind:value={$emailFormData.email}
              />
              <Button
                type="submit"
                variant="secondary"
                class="cursor-pointer sm:max-w-24 w-full"
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
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="w-22">Username</Form.Label>
              <Input
                {...props}
                class="flex-1 min-w-[300px]"
                bind:value={$usernameFormData.username}
              />
              <Button
                type="submit"
                variant="secondary"
                class="cursor-pointer sm:max-w-24 w-full"
                disabled={$usernameFormData.username ===
                  session.user.user_metadata.username}
              >
                Update
              </Button>
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
    </form>
    {#if $flash?.field === "username" && $flash?.message && $flash?.type}
      <Alert.Root>
        <Alert.Title
          >{$flash.type === "error" ? "Error" : "Updated username"}</Alert.Title
        >
        <Alert.Description>{$flash.message}</Alert.Description>
      </Alert.Root>
    {/if}
  </div>
</div>
