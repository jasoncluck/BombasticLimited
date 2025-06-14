<script lang="ts">
  import { page } from "$app/state";

  const params = page.url.searchParams;
  console.log(params);
  const error = params.get("error");
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");

  //TODO: Finish auth error page

  console.log(error);
  console.log(errorCode);
  console.log(errorDescription);
</script>

<p>Login error</p>
