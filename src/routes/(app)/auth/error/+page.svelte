<script lang="ts">
  import { page } from '$app/state';
  import * as Alert from '$lib/components/ui/alert/index.js';

  function parseHashParams(hash: string): URLSearchParams {
    // Remove the leading # and parse as URLSearchParams
    const hashWithoutFragment = hash.startsWith('#') ? hash.slice(1) : hash;
    return new URLSearchParams(hashWithoutFragment);
  }

  const hashParams = parseHashParams(page.url.hash);
  console.log(hashParams);

  const errorCode = hashParams.get('error_code');
  const errorDescription = hashParams.get('error_description');

  let errorTitle: string = 'An error occurred';

  console.log(errorCode);
  switch (errorCode) {
    case 'identity_already_exists':
      errorTitle = 'Unable to link Discord account';
      break;
    default:
      errorTitle = 'An unexpected error occurred';
  }
</script>

<div class="flex w-full items-center justify-center">
  <div class="w-[500px]">
    <Alert.Root>
      <Alert.Title>{errorTitle}</Alert.Title>
      <Alert.Description>{errorDescription}</Alert.Description>
    </Alert.Root>
  </div>
</div>
