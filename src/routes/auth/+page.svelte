<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Label } from "$lib/components/ui/label";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Alert, type AlertVariant } from "$lib/components/ui/alert";
  import { Github, Loader } from "@lucide/svelte";

  let { form } = $props();

  let isLogin = $state(true);
  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let alertMessage = $state("");
  let alertType = $state<AlertVariant>("default");

  function toggleForm() {
    isLogin = !isLogin;
    alertMessage = "";
  }

  if (form && form.message) {
    alertMessage = form.message;
  }
</script>

<div class="flex flex-row justify-center">
  <form method="POST" action="?/login" class="mt-24">
    <Card.Root class="p-6">
      <Card.Header class="space-y-1">
        <Card.Title class="text-2xl">
          {isLogin ? "Login" : "Create an account"}
        </Card.Title>
        <Card.Description>
          {isLogin
            ? "Enter your email and password to log in"
            : "Enter your email and password to create your account"}
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-4">
        <div class="grid grid-cols-2 gap-6">
          <Button variant="outline">
            <Github />
            GitHub
          </Button>
        </div>
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t"></span>
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-card text-muted-foreground px-2"
              >Or continue with</span
            >
          </div>
        </div>
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input
            name="email"
            type="email"
            placeholder="gbu@example.com"
            bind:value={email}
            autocomplete="email"
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">Password</Label>
          <Input
            name="password"
            type="password"
            bind:value={password}
            autocomplete="current-password"
          />
        </div>
        {#if alertMessage}
          <Alert variant={alertType}>
            {alertMessage}
          </Alert>
        {/if}
      </Card.Content>
      <Card.Footer class="grid gap-4">
        <Button
          formaction={!isLogin ? "?/signup" : "?/login"}
          formmethod="POST"
          class="w-full"
          type="submit"
          disabled={loading}
        >
          {#if loading}
            <Loader class="animate-spin mr-2" />
          {/if}
          {isLogin ? "Login" : "Create account"}
        </Button>
        <Button
          variant="link"
          class="w-full"
          disabled={loading}
          onclick={toggleForm}
        >
          {isLogin ? "Create a new account" : "Already have an account? Login"}
        </Button>
      </Card.Footer>
    </Card.Root>
  </form>
</div>
