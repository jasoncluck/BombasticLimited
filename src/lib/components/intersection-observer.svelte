<script lang="ts">
  import { type Snippet } from 'svelte';

  interface Props {
    onActive: () => void;
    onInactive?: () => void;
    threshold?: number;
    disableObserver: boolean;
    children: Snippet;
    retryOnInterval?: boolean;
  }

  let {
    threshold = 0.25,
    disableObserver = false,
    children,
    onActive,
    onInactive,
    retryOnInterval = false,
  }: Props = $props();

  let root: HTMLElement;
  let observer: IntersectionObserver | null = null;
  let isIntersecting = false;
  let activeInterval: ReturnType<typeof setInterval> | null = null;

  const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';

  function createObserver() {
    if (!hasIntersectionObserver || disableObserver) return;

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const shouldActivate =
            entry.isIntersecting && entry.intersectionRatio >= threshold;

          if (shouldActivate && !disableObserver) {
            if (!isIntersecting) {
              onActive();
              isIntersecting = true;
            }
            if (retryOnInterval && !activeInterval) {
              activeInterval = setInterval(() => onActive(), 2000);
            }
          } else {
            if (isIntersecting && onInactive) {
              onInactive();
            }
            isIntersecting = false;
            if (activeInterval) {
              clearInterval(activeInterval);
              activeInterval = null;
            }
          }
        });
      },
      { rootMargin: '0px', threshold }
    );

    observer.observe(root);
  }

  // Disconnect the observer and clean up intervals
  function disconnectObserver() {
    if (activeInterval) {
      clearInterval(activeInterval);
      activeInterval = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  $effect(() => {
    disconnectObserver();
    if (!disableObserver) {
      createObserver();
    }

    return disconnectObserver;
  });
</script>

<div bind:this={root} data-testid="general-observer">
  {@render children()}
</div>
