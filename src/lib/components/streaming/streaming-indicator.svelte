<script lang="ts">
  let {
    isStreaming = false,
    size = 'sm',
  }: {
    isStreaming: boolean;
    size?: 'sm' | 'md' | 'lg';
  } = $props();

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };
</script>

{#if isStreaming}
  <div
    class="streaming-indicator absolute bottom-0 left-0 z-10 rounded-full bg-red-600 {sizeClasses[
      size
    ]}"
    title="Live streaming"
  ></div>
{/if}
