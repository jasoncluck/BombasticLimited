<script lang="ts">
  interface LoaderProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
    visible?: boolean;
    variant?: 'fullscreen' | 'block';
  }

  let {
    message = 'Loading...',
    size = 'md',
    visible = true,
    variant = 'fullscreen',
  }: LoaderProps = $props();

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const containerClasses = $derived(
    variant === 'fullscreen'
      ? 'pointer-events-none fixed inset-0 flex items-center justify-center'
      : 'flex items-center justify-center'
  );
</script>

{#if visible}
  <div class={containerClasses}>
    <div class="text-center">
      <div
        class="border-primary mx-auto animate-spin rounded-full border-b-2 {sizeClasses[
          size
        ]} {variant === 'fullscreen' ? 'mb-2' : ''}"
      ></div>
      {#if message && variant === 'fullscreen'}
        <p class="text-muted-foreground text-sm">{message}</p>
      {/if}
    </div>
  </div>
{/if}
