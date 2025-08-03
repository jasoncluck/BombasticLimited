<script lang="ts">
  interface LoaderProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
    visible?: boolean;
  }

  let {
    message = 'Loading...',
    size = 'md',
    visible = true,
  }: LoaderProps = $props();

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
</script>

<div
  class="flex items-center justify-center p-4 {visible
    ? 'visible'
    : 'invisible'}"
>
  <div class="text-center">
    <div
      class="border-primary mx-auto mb-2 animate-spin rounded-full border-b-2 {sizeClasses[
        size
      ]}"
    ></div>
    <p class="text-muted-foreground text-sm">{message}</p>
  </div>
</div>
