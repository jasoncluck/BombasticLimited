<script lang="ts">
  import { page } from "$app/state";

  import * as Alert from "$lib/components/ui/alert/index.js";
  const params = page.url.searchParams;
  console.log(params);
  const successMessage = params.get("message");
  const error = params.get("error");
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");

  //TODO: Finish auth error page

  console.log(error);
  console.log(errorCode);
  console.log(errorDescription);
</script>

<div class="flex items-center justify-center max-w-[700px]">
  <Alert.Root>
    <Alert.Title>Success</Alert.Title>
    <Alert.Description>{successMessage}</Alert.Description>
  </Alert.Root>
</div>
