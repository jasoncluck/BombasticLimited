<script lang="ts">
  import * as Pagination from '$lib/components/ui/pagination/index.js';
  import { preloadData } from '$app/navigation';
  import { page } from '$app/state';
  import { generatePaginationUrl } from './pagination.js';
  import { MediaQuery, SvelteSet } from 'svelte/reactivity';

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

  // Responsive design
  const isDesktop = new MediaQuery('(min-width: 768px)');
  const siblingCount = $derived(isDesktop.current ? 1 : 0);

  // Track preloaded pages to avoid duplicate preloading
  let preloadedPages = $state(new Set<number>());

  // Sync currentPage with URL parameters
  $effect(() => {
    const urlPage = parseInt(page.url.searchParams.get('page') || '1', 10);
    if (urlPage !== currentPage && urlPage > 0) {
      currentPage = urlPage;
    }
  });

  // Reset preloaded pages when current page changes
  $effect(() => {
    // Clear preloaded pages when currentPage changes to avoid stale cache
    preloadedPages.clear();
    preloadedPages = new SvelteSet<number>();
  });

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

  // Handle page click
  function handlePageClick(pageNum: number): void {
    onPageChange(pageNum);
  }

  // Calculate max page for bounds checking
  const maxPage = $derived(Math.ceil(count / perPage));
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
