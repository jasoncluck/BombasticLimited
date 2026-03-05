<script lang="ts">
  import { page } from '$app/state';

  import * as Alert from '$lib/components/ui/alert/index.js';
  const params = page.url.searchParams;
  const successMessage = params.get('message');
  const code = params.get('code');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
</script>

<div class="flex w-full items-center justify-center">
  <div class="w-[800px]">
    {#if successMessage}
      <Alert.Root>
        <Alert.Title>Success</Alert.Title>
        <Alert.Description>{successMessage}</Alert.Description>
      </Alert.Root>
    {:else if code}
      <Alert.Root>
        <Alert.Title>Email Updated</Alert.Title>
        <Alert.Description
          >The email address for your account has been updated successfully.</Alert.Description
        >
      </Alert.Root>
    {:else if error}
      <Alert.Root>
        <Alert.Title>Error</Alert.Title>
        <Alert.Description>{errorDescription}</Alert.Description>
      </Alert.Root>
    {/if}
  </div>
</div>
