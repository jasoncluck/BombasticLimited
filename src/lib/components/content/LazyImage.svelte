<script lang="ts">
  import IntersectionObserver from '../intersection-observer.svelte';
  import { predictivePreloader } from '$lib/utils/predictive-image-preloader';
  import { onMount } from 'svelte';

  interface LazyImageProps {
    src: string | null;
    alt: string;
    class?: string;
    index?: number;
    loading?: 'eager' | 'lazy';
    fetchpriority?: 'high' | 'low' | 'auto';
    decoding?: 'async' | 'sync' | 'auto';
    predictivePreload?: boolean;
  }

  let {
    src,
    alt,
    class: className = '',
    index = 0,
    loading,
    fetchpriority,
    decoding = 'async',
    predictivePreload = true,
  }: LazyImageProps = $props();

  // Determine if this image should be loaded with priority
  const isHighPriority = index < 20;

  // Override loading and fetchpriority based on priority unless explicitly set
  const finalLoading = loading ?? (isHighPriority ? 'eager' : 'lazy');
  const finalFetchpriority =
    fetchpriority ?? (isHighPriority ? 'high' : 'auto');

  let shouldLoad = $state(isHighPriority); // High priority images load immediately
  let imageElement = $state<HTMLImageElement>();

  function handleIntersection() {
    shouldLoad = true;
  }

  // Enhanced intersection observer for predictive preloading
  function handlePreloadIntersection() {
    if (predictivePreload && src && !shouldLoad) {
      // Trigger predictive preloading when image is getting close to viewport
      predictivePreloader.preloadSpecificImages([src], 'low');
    }
  }

  onMount(() => {
    // Register this image for predictive preloading if it's not high priority
    if (!isHighPriority && predictivePreload && src) {
      // Small delay to ensure image is in DOM
      setTimeout(() => {
        if (imageElement) {
          // This helps the predictive preloader track this image
          imageElement.dataset.predictiveIndex = index.toString();
        }
      }, 100);
    }
  });
</script>

{#if isHighPriority || shouldLoad}
  <img
    bind:this={imageElement}
    {src}
    {alt}
    class={className}
    loading={finalLoading}
    fetchpriority={finalFetchpriority}
    {decoding}
    data-predictive-index={index}
  />
{:else}
  <!-- Use a more aggressive threshold for preloading (0.3) and regular loading (0.1) -->
  <IntersectionObserver
    threshold={0.3}
    disableObserver={false}
    onActive={handlePreloadIntersection}
  >
    <IntersectionObserver
      threshold={0.1}
      disableObserver={false}
      onActive={handleIntersection}
    >
      <div
        class={className}
        style="background-color: #f3f4f6; display: flex; align-items: center; justify-content: center;"
        role="img"
        aria-label={alt}
        data-predictive-index={index}
      >
        <!-- Placeholder while not in view -->
      </div>
    </IntersectionObserver>
  </IntersectionObserver>
{/if}
