<script lang="ts">
  import LoginForm from './login-form.svelte';

  const { data } = $props();
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    {#if data.loginForm && data.supabase}
      <LoginForm form={data.loginForm} supabase={data.supabase} />
    {/if}
  </div>
</div>
