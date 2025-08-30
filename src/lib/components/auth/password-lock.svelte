<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card/index.js';
  import { Alert, AlertDescription } from '$lib/components/ui/alert/index';
  import { Lock, AlertCircle } from '@lucide/svelte';
  import type { PasswordLockState } from '$lib/state/password-lock.svelte';

  interface Props {
    passwordLockState: PasswordLockState;
  }

  let { passwordLockState }: Props = $props();

  let password = $state('');
  let showError = $state(false);
  let isSubmitting = $state(false);

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (!password.trim()) {
      return;
    }

    isSubmitting = true;
    showError = false;

    // Add a small delay to prevent brute force attempts
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (passwordLockState.checkPassword(password)) {
      passwordLockState.unlock();
      password = '';
    } else {
      showError = true;
      password = '';
      // Auto-hide error after 3 seconds
      setTimeout(() => {
        showError = false;
      }, 3000);
    }

    isSubmitting = false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      handleSubmit(event);
    }
  }
</script>

<div
  class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4"
>
  <Card class="w-full max-w-md">
    <CardHeader class="text-center">
      <div
        class="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
      >
        <Lock class="text-primary h-6 w-6" />
      </div>
      <CardTitle class="text-2xl font-bold">Access Required</CardTitle>
      <CardDescription class="text-muted-foreground">
        Please enter the password to access Bombastic
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <form onsubmit={handleSubmit} class="space-y-4">
        <div class="space-y-2">
          <Input
            type="password"
            placeholder="Enter password"
            bind:value={password}
            onkeydown={handleKeydown}
            disabled={isSubmitting}
            class="text-center"
            autocomplete="current-password"
          />
        </div>

        {#if showError}
          <Alert variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertDescription>
              Incorrect password. Please try again.
            </AlertDescription>
          </Alert>
        {/if}

        <Button
          type="submit"
          class="w-full"
          disabled={isSubmitting || !password.trim()}
        >
          {#if isSubmitting}
            <div
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
            Verifying...
          {:else}
            Unlock
          {/if}
        </Button>
      </form>
    </CardContent>
  </Card>
</div>
