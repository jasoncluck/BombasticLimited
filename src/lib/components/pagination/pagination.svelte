<script lang="ts">
  import * as Pagination from '$lib/components/ui/pagination/index.js';
  import { preloadData } from '$app/navigation';
  import { generatePaginationUrl } from './pagination.js';
  import { getMediaQueryState } from '$lib/state/media-query.svelte.js';

  let {
    count,
    currentPage = $bindable(1),
    perPage,
    onPageChange,
  }: {
    count: number;
    currentPage: number;
    perPage: number;
    onPageChange: (pageNum: number) => void;
  } = $props();

  const mediaQueryState = getMediaQueryState();

  // Responsive design
  const siblingCount = $derived(mediaQueryState.isSm ? 1 : 0);

  // Track preloaded pages to avoid duplicate preloading
  let preloadedPages = $state(new Set<number>());

  // Track timeouts for delayed preloading
  let preloadTimeouts = $state(
    new Map<string, ReturnType<typeof setTimeout>>()
  );

  // Preload a specific page
  async function preloadPage(pageNum: number): Promise<void> {
    if (preloadedPages.has(pageNum) || pageNum === currentPage) return;

    try {
      const url = generatePaginationUrl({
        url: new URL(window.location.href),
        pageNum,
      });
      preloadData(url);
      preloadedPages.add(pageNum);
    } catch (error) {
      // Silently fail if preloading doesn't work
      console.debug('Pagination preload failed:', error);
    }
  }

  // Handle page hover for preloading
  function handlePageHover(pageNum: number): void {
    preloadPage(pageNum);
  }

  // Handle page click with delayed preloading
  function handlePageClick(pageNum: number): void {
    onPageChange(pageNum);

    // Schedule preloading of adjacent pages after 300ms
    scheduleAdjacentPreload(pageNum);
  }

  // Schedule preloading of adjacent pages after a delay
  function scheduleAdjacentPreload(newCurrentPage: number): void {
    // Clear any existing timeouts
    clearAllPreloadTimeouts();

    // Schedule preload for next page (if exists)
    if (newCurrentPage < maxPage) {
      const nextTimeout = setTimeout(() => {
        preloadPage(newCurrentPage + 1);
      }, 300);
      preloadTimeouts.set('next', nextTimeout);
    }

    // Schedule preload for previous page (if exists)
    if (newCurrentPage > 1) {
      const prevTimeout = setTimeout(() => {
        preloadPage(newCurrentPage - 1);
      }, 300);
      preloadTimeouts.set('prev', prevTimeout);
    }
  }

  // Clear all preload timeouts
  function clearAllPreloadTimeouts(): void {
    preloadTimeouts.forEach((timeout) => clearTimeout(timeout));
    preloadTimeouts.clear();
  }

  // Calculate max page for bounds checking
  const maxPage = $derived(Math.ceil(count / perPage));

  // Cleanup timeouts when component is destroyed
  $effect(() => {
    return () => {
      clearAllPreloadTimeouts();
    };
  });
</script>

<div class="flex w-full justify-center px-2">
  <Pagination.Root
    {count}
    {perPage}
    {siblingCount}
    bind:page={currentPage}
    onPageChange={handlePageClick}
  >
    {#snippet children({ pages })}
      <Pagination.Content class="justify-center gap-1">
        <Pagination.Item>
          <Pagination.PrevButton
            class="cursor-pointer"
            onmouseenter={() =>
              currentPage > 1 && handlePageHover(currentPage - 1)}
          />
        </Pagination.Item>
        {#each pages as page (page.key)}
          {#if page.type === 'ellipsis'}
            <Pagination.Item>
              <Pagination.Ellipsis />
            </Pagination.Item>
          {:else}
            <Pagination.Item>
              <Pagination.Link
                class="cursor-pointer"
                {page}
                isActive={currentPage === page.value}
                onmouseenter={() => handlePageHover(page.value)}
              >
                {page.value}
              </Pagination.Link>
            </Pagination.Item>
          {/if}
        {/each}
        <Pagination.Item>
          <Pagination.NextButton
            class="cursor-pointer"
            onmouseenter={() =>
              currentPage < maxPage && handlePageHover(currentPage + 1)}
          />
        </Pagination.Item>
      </Pagination.Content>
    {/snippet}
  </Pagination.Root>
</div>
