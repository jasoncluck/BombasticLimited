<script lang="ts">
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
</script>

<img
  {src}
  {alt}
  class={className}
  loading={finalLoading}
  fetchpriority={finalFetchpriority}
  {decoding}
  data-image-index={index}
/>
