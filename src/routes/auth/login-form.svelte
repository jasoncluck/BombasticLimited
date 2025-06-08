<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Github, Loader } from "@lucide/svelte";
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import { zodClient, type Infer } from "sveltekit-superforms/adapters";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Form from "$lib/components/ui/form";
  import { type LoginSchema, loginSchema } from "./schema";

  let {
    data,
    onToggle,
  }: {
    data: { form: SuperValidated<Infer<LoginSchema>> };
    onToggle: () => void;
  } = $props();

  const loginForm = superForm(data.form, {
    validators: zodClient(loginSchema),
    onResult() {
      console.log("login: in on result");
    },
    onUpdated(event) {
      console.log("login: in on updated");
      console.log(event);
    },
  });

  let isSubmitting = $state(false);

  const { form: formData, enhance } = loginForm;
</script>

<Card.Root class="p-6 gap-6">
  <Card.Header class="">
    <Card.Title class="text-2xl">Login</Card.Title>
    <Card.Description>Enter your email and password to log in</Card.Description>
  </Card.Header>

  <form method="POST" action="?/login" use:enhance>
    <Card.Content class="grid gap-4">
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

      <Form.Field form={loginForm} name="email">
        <div
          class="md:grid md:grid-cols-4 items-center flex flex-wrap gap-2 md:gap-4"
        >
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

      <Form.Field form={loginForm} name="password">
        <div
          class="md:grid md:grid-cols-4 items-center flex flex-wrap gap-2 md:gap-4"
        >
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
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
      <Alert.Root>
        <Alert.Title>Success! Your changes have been saved</Alert.Title>
        <Alert.Description
          >This is an alert with icon, title and description.</Alert.Description
        >
      </Alert.Root>
    </Card.Content>

    <Card.Footer>
      <Button class="w-full" type="submit" disabled={isSubmitting}>
        {#if isSubmitting}
          <Loader class="animate-spin mr-2" />
        {/if}
        Login
      </Button>

      <Button
        variant="link"
        type="button"
        class="w-full cursor-pointer"
        disabled={isSubmitting}
        onclick={onToggle}
      >
        Create a new account
      </Button>
    </Card.Footer>
  </form>
</Card.Root>
