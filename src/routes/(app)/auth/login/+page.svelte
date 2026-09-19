<script lang="ts">
  import LoginForm from './login-form.svelte';

  const { data } = $props();
  const { loginForm } = $derived(data);
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    <LoginForm form={loginForm} />
  </div>
</div>
