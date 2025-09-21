<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getPageLoadingState } from '$lib/state/page-loading.svelte.js';

  interface PageLoadingWrapperProps {
    children: Snippet;
    showLoader?: boolean;
    loaderMessage?: string;
  }

  let {
    children,
    showLoader = true,
    loaderMessage = 'Loading content...'
  }: PageLoadingWrapperProps = $props();

  const pageLoadingState = getPageLoadingState();

  // Show loading background while images are loading
  const showLoadingBackground = $derived(pageLoadingState.isLoading && !pageLoadingState.imagesReady);
</script>

{#if showLoadingBackground}
  <div class="min-h-screen bg-background-lighter">
    {#if showLoader}
      <div class="flex h-screen items-center justify-center">
        <div class="text-center">
          <div class="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2"></div>
          <p class="text-muted-foreground text-sm">{loaderMessage}</p>
        </div>
      </div>
    {/if}
  </div>
{:else}
  {@render children()}
{/if}