<script lang="ts">
  interface LazyImageProps {
    src: string | null;
    alt: string;
    class?: string;
    index?: number;
    loading?: 'eager' | 'lazy';
    fetchpriority?: 'high' | 'low' | 'auto';
    decoding?: 'async' | 'sync' | 'auto';
    onload?: (event: Event) => void;
    onerror?: (event: Event) => void;
  }

  let {
    src,
    alt,
    class: className = '',
    index = 0,
    loading,
    fetchpriority,
    decoding = 'async',
    onload,
    onerror,
  }: LazyImageProps = $props();

  // Determine if this image should be loaded with priority. `index` is
  // local to whichever carousel/grid section rendered this image (each
  // section restarts at 0), and sections show at most 5 columns
  // (@4xl:grid-cols-5 / @4xl:basis-1/5) at once before scrolling — so this
  // only needs to cover what's actually visible in one row, not an entire
  // overview section's worth of items (which used to all be eager/high
  // priority since sections are 15/6 items, both under the old threshold
  // of 20).
  const isHighPriority = index < 6;

  // Override loading and fetchpriority based on priority unless explicitly set
  const finalLoading = loading ?? (isHighPriority ? 'eager' : 'lazy');
  const finalFetchpriority =
    fetchpriority ?? (isHighPriority ? 'high' : 'auto');

  // Internal event handlers to call the passed props
  function handleLoad(event: Event) {
    onload?.(event);
  }

  function handleError(event: Event) {
    onerror?.(event);
  }
</script>

<img
  {src}
  {alt}
  class={className}
  loading={finalLoading}
  fetchpriority={finalFetchpriority}
  {decoding}
  data-image-index={index}
  onload={handleLoad}
  onerror={handleError}
/>
