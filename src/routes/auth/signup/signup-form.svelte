<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Github, Loader } from "@lucide/svelte";
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import { zodClient, type Infer } from "sveltekit-superforms/adapters";
  import * as Form from "$lib/components/ui/form";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { getFlash } from "sveltekit-flash-message";
  import { signupSchema, type SignupSchema } from "../schema";
  import { goto } from "$app/navigation";

  let {
    data,
    currentEmail = $bindable(),
  }: {
    data: { form: SuperValidated<Infer<SignupSchema>> };
    currentEmail: string;
  } = $props();

  const flash = getFlash(page);

  const signupForm = superForm(data.form, {
    validators: zodClient(signupSchema),
    validationMethod: "onsubmit",
    onResult() {
      console.log("signup: in on result");
    },
    onUpdated(event) {
      console.log("signup: in on updated");
      console.log(event);
    },
  });

  let isSubmitting = $state(false);

  const { form: formData, enhance } = signupForm;

  onMount(() => {
    if (currentEmail) {
      $formData.email = currentEmail;
    }
  });
</script>

<Card.Root class="p-6">
  <Card.Header class="space-y-1">
    <Card.Title class="text-2xl">Create an account</Card.Title>
    <Card.Description>
      Enter your details to create your account
    </Card.Description>
  </Card.Header>

  <form method="POST" action="?/signup" use:enhance>
    <Card.Content class="grid gap-4 mb-4">
      <div class="grid grid-cols-2 gap-6">
        <Button variant="outline" type="button">
          <Github />
          GitHub
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

      <Form.Field form={signupForm} name="email">
        <div class=" items-center flex flex-wrap gap-2">
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
        <Form.FieldErrors class="mb-2" />
      </Form.Field>

      <Form.Field form={signupForm} name="username">
        <div class="items-center flex flex-wrap gap-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="text-right">Username</Form.Label>
              <Input
                {...props}
                class="col-span-3"
                bind:value={$formData.username}
              />
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>

      <Form.Field form={signupForm} name="password">
        <div class="items-center flex flex-wrap gap-2">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label class="text-right">Password</Form.Label>
              <Input
                {...props}
                class="col-span-3"
                bind:value={$formData.password}
                autocomplete="new-password"
                type="password"
              />
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
      {/if}
    </Card.Content>
    <Card.Footer class="grid gap-4">
      <Button
        class="w-full cursor-pointer"
        type="submit"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <Loader class="animate-spin mr-2" />
        {/if}
        Create account
      </Button>

      <Button
        variant="link"
        type="button"
        class="w-full cursor-pointer"
        disabled={isSubmitting}
        onclick={() => {
          goto("/auth/login");
        }}
      >
        Already have an account? Login
      </Button>
    </Card.Footer>
  </form>
</Card.Root>
