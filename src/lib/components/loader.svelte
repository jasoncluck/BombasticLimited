<script lang="ts">
  interface LoaderProps {
    message?: string;
    size?: "sm" | "md" | "lg";
    class?: string;
  }

  let { message = "Loading...", size = "md" }: LoaderProps = $props();

  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };
</script>

<div class="flex items-center justify-center p-8">
  <div class="text-center">
    <div
      class="animate-spin rounded-full border-b-2 border-primary mx-auto mb-2 {sizeClasses[
        size
      ]}"
    ></div>
    <p class="text-sm text-muted-foreground">{message}</p>
  </div>
</div>
