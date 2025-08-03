<script lang="ts">
  import { page } from '$app/state';
  import * as Alert from '$lib/components/ui/alert/index.js';

  const params = page.url.searchParams;
  const error = params.get('error') ?? params.get('error_description');
</script>

<div class="flex w-full items-center justify-center">
  <div class="w-[500px]">
    <Alert.Root>
      <Alert.Title>Unable to login</Alert.Title>
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  </div>
</div>
