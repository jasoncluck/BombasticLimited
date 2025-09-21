<script lang="ts">
  import { getPageLoadingState } from '$lib/state/page-loading.svelte.js';

  let {
    isNavigatingToContent,
  }: {
    isNavigatingToContent: boolean;
  } = $props();

  const pageLoadingState = getPageLoadingState();
  
  // Show loading overlay when images are loading (with potential delay for search)
  const showLoadingOverlay = $derived(pageLoadingState.shouldShowLoadingOverlay);
</script>

<!-- Image Loading Overlay -->
{#if showLoadingOverlay}
  <div
    class="absolute inset-0 z-[10000] bg-background-lighter"
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
