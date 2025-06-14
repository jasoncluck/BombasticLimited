<script lang="ts">
  import * as Form from "$lib/components/ui/form";
  import Input from "$lib/components/ui/input/input.svelte";
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import { zodClient, type Infer } from "sveltekit-superforms/adapters";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import {
    emailSchema,
    passwordSchema,
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

  let isPendingVerificationEmail = $state(false);

  const emailForm = superForm(data.emailForm, {
    validators: zodClient(emailSchema),
    onUpdated(event) {
      isPendingVerificationEmail = true;
      console.log("in updated");
      console.log(event.form.message);
    },
  });

  const usernameForm = superForm(data.usernameForm, {
    validators: zodClient(usernameSchema),
  });

  const passwordForm = superForm(data.passwordForm, {
    validators: zodClient(passwordSchema),
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
  <div class="flex flex-col gap-4">
    <h1 class="header-primary">Account settings</h1>
    <form use:emailEnhance method="POST" action="?/updateEmail">
      <Form.Field form={emailForm} name="email">
        <div class="grid grid-cols-5 items-center gap-4">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label for="name" class="text-right">Email</Form.Label>
              <Input
                {...props}
                class="col-span-3"
                bind:value={$emailFormData.email}
              />
              <Button
                type="submit"
                variant="secondary"
                class="cursor-pointer col-span-1"
                disabled={$emailFormData.email === session.user.email}
              >
                Update</Button
              >
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
      {#if $flash?.message && $flash?.type}
        <Alert.Root>
          <Alert.Title
            >{$flash.type === "error" ? "Error" : "Success"}</Alert.Title
          >
          <Alert.Description>{$flash.message}</Alert.Description>
        </Alert.Root>
      {:else if isPendingVerificationEmail}
        <Alert.Root>
          <Alert.Title>Email sent</Alert.Title>
          <Alert.Description
            >Click the verification link in the sent email to change your
            account email.</Alert.Description
          >
        </Alert.Root>
      {/if}
    </form>
    <form use:usernameEnhance method="POST">
      <Form.Field form={usernameForm} name="username">
        <div class="grid grid-cols-5 items-center gap-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label for="name" class="text-right">Username</Form.Label>
              <Input
                {...props}
                class="col-span-3"
                bind:value={$usernameFormData.username}
              />
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
    </form>
  </div>
</div>
