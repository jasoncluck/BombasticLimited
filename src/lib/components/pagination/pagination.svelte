<script lang="ts">
  import * as Pagination from '$lib/components/ui/pagination/index.js';
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

  // Note: Removed pagination preloading to eliminate CSS preload warnings
  // Pages will be loaded on-demand when user actually navigates

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
          <Pagination.PrevButton class="cursor-pointer" />
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
              >
                {page.value}
              </Pagination.Link>
            </Pagination.Item>
          {/if}
        {/each}
        <Pagination.Item>
          <Pagination.NextButton class="cursor-pointer" />
        </Pagination.Item>
      </Pagination.Content>
    {/snippet}
  </Pagination.Root>
</div>
