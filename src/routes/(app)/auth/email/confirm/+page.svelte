<script lang="ts">
  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Card from '$lib/components/ui/card';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { enhance } from '$app/forms';

  let { form } = $props();
</script>

<div class="mt-24 flex w-full items-center justify-center">
  <Card.Root class="w-[500px] p-6">
    <Card.Header>
      <Card.Title class="text-2xl">Confirm your new email</Card.Title>
      <Card.Description
        >Enter the code sent to your new email address</Card.Description
      >
    </Card.Header>
    <form method="POST" action="?/confirm" use:enhance>
      <Card.Content class="grid gap-4">
        <Label for="code">Confirmation code</Label>
        <Input id="code" name="code" autocomplete="one-time-code" />
        {#if form?.error}
          <Alert.Root>
            <Alert.Title>Error</Alert.Title>
            <Alert.Description>{form.error}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer>
        <Button type="submit" class="w-full cursor-pointer">Confirm</Button>
      </Card.Footer>
    </form>
  </Card.Root>
</div>
