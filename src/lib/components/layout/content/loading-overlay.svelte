<script lang="ts">
  let {
    isNavigatingToContent,
  }: {
    isNavigatingToContent: boolean;
  } = $props();

  // Never show loading overlay - images will load all at once without visual feedback
  const showLoadingOverlay = $derived(false);
</script>

<!-- Image Loading Overlay - Disabled per user request -->
{#if showLoadingOverlay}
  <div
    class="bg-background-lighter absolute inset-0 z-[10000]"
    data-testid="image-loading-overlay"
  ></div>
{/if}

<!-- Navigation Loading Overlay (kept separate for navigation states) -->
<div
  class="absolute inset-0 z-[10000] flex items-center justify-center bg-transparent"
  class:opacity-100={isNavigatingToContent}
  class:opacity-0={!isNavigatingToContent}
  class:pointer-events-none={!isNavigatingToContent}
  class:scale-100={isNavigatingToContent}
  class:scale-95={!isNavigatingToContent}
></div>
