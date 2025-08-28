<script lang="ts">
  import IntersectionObserver from '../intersection-observer.svelte';

  interface LazyImageProps {
    src: string | null;
    alt: string;
    class?: string;
    index?: number;
    loading?: 'eager' | 'lazy';
    fetchpriority?: 'high' | 'low' | 'auto';
    decoding?: 'async' | 'sync' | 'auto';
  }

  let {
    src,
    alt,
    class: className = '',
    index = 0,
    loading,
    fetchpriority,
    decoding = 'async',
  }: LazyImageProps = $props();

  // Determine if this image should be loaded with priority
  const isHighPriority = index < 20;

  // Override loading and fetchpriority based on priority unless explicitly set
  const finalLoading = loading ?? (isHighPriority ? 'eager' : 'lazy');
  const finalFetchpriority =
    fetchpriority ?? (isHighPriority ? 'high' : 'auto');

  let imageLoaded = $state(false);
  let imageError = $state(false);
  let shouldLoad = $state(isHighPriority); // High priority images load immediately

  function handleLoad() {
    imageLoaded = true;
  }

  function handleError() {
    imageError = true;
  }

  function handleIntersection() {
    shouldLoad = true;
  }
</script>

{#if isHighPriority || shouldLoad}
  <img
    {src}
    {alt}
    class={className}
    loading={finalLoading}
    fetchpriority={finalFetchpriority}
    {decoding}
    onload={handleLoad}
    onerror={handleError}
  />
{:else}
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
    >
      <!-- Placeholder while not in view -->
    </div>
  </IntersectionObserver>
{/if}
