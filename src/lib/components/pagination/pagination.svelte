<script lang="ts">
  import * as Pagination from '$lib/components/ui/pagination/index.js';
  import { preloadData } from '$app/navigation';
  import { generatePaginationUrl } from './pagination.js';
  import { MediaQuery } from 'svelte/reactivity';

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

  // Track which buttons are currently being hovered
  let hoveredButtons = $state(new Set<'prev' | 'next'>());

  // Calculate max page for bounds checking
  const maxPage = $derived(Math.ceil(count / perPage));

  // Preload a specific page
  async function preloadPage(pageNum: number): Promise<void> {
    if (
      preloadedPages.has(pageNum) ||
      pageNum === currentPage ||
      pageNum < 1 ||
      pageNum > maxPage
    ) {
      return;
    }

    try {
      const url = generatePaginationUrl({
        url: new URL(window.location.href),
        pageNum,
      });
      await preloadData(url);
      preloadedPages.add(pageNum);
    } catch (error) {
      // Silently fail if preloading doesn't work
      console.debug('Pagination preload failed:', error);
    }
  }

  // Preload adjacent pages for the current page
  async function preloadAdjacentPages(pageNum: number): Promise<void> {
    const preloadPromises: Promise<void>[] = [];

    // Preload previous page if it exists
    if (pageNum > 1) {
      preloadPromises.push(preloadPage(pageNum - 1));
    }

    // Preload next page if it exists
    if (pageNum < maxPage) {
      preloadPromises.push(preloadPage(pageNum + 1));
    }

    await Promise.all(preloadPromises);
  }

  // Handle page hover for preloading
  function handlePageHover(pageNum: number): void {
    preloadPage(pageNum);
  }

  // Handle page click
  function handlePageClick(pageNum: number): void {
    onPageChange(pageNum);
    // After changing pages, preload the new adjacent pages
    // preloadAdjacentPages(pageNum);
  }

  // Handle prev button click
  function handlePrevClick(): void {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      handlePageClick(newPage);
    }
  }

  // Handle next button click
  function handleNextClick(): void {
    if (currentPage < maxPage) {
      const newPage = currentPage + 1;
      handlePageClick(newPage);
    }
  }

  // Handle prev button hover
  function handlePrevHover(): void {
    hoveredButtons.add('prev');
    if (currentPage > 1) {
      handlePageHover(currentPage - 1);
    }
  }

  // Handle next button hover
  function handleNextHover(): void {
    hoveredButtons.add('next');
    if (currentPage < maxPage) {
      handlePageHover(currentPage + 1);
    }
  }

  // Handle mouse leave for buttons
  function handlePrevLeave(): void {
    hoveredButtons.delete('prev');
  }

  function handleNextLeave(): void {
    hoveredButtons.delete('next');
  }

  // Effect to preload when currentPage changes and buttons are still hovered
  $effect(() => {
    // When currentPage changes, check if prev/next buttons are still hovered
    // and preload the new target pages
    if (hoveredButtons.has('prev') && currentPage > 1) {
      handlePageHover(currentPage - 1);
    }
    if (hoveredButtons.has('next') && currentPage < maxPage) {
      handlePageHover(currentPage + 1);
    }
  });

  // Initial preload of adjacent pages when component mounts
  $effect(() => {
    preloadAdjacentPages(currentPage);
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
            onclick={handlePrevClick}
            onmouseenter={handlePrevHover}
            onmouseleave={handlePrevLeave}
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
                onclick={() => handlePageClick(page.value)}
              >
                {page.value}
              </Pagination.Link>
            </Pagination.Item>
          {/if}
        {/each}
        <Pagination.Item>
          <Pagination.NextButton
            class="cursor-pointer"
            onclick={handleNextClick}
            onmouseenter={handleNextHover}
            onmouseleave={handleNextLeave}
          />
        </Pagination.Item>
      </Pagination.Content>
    {/snippet}
  </Pagination.Root>
</div>
