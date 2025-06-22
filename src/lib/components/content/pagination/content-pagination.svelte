<script lang="ts">
  import { page } from "$app/state";
  import * as Pagination from "$lib/components/ui/pagination/index.js";
  import { DEFAULT_NUM_VIDEOS_TILES } from "$lib/supabase/videos";
  import { updatePaginationQueryParams } from "./content-pagination";

  let {
    count,
    currentPage = $bindable(1),
  }: {
    count: number;
    currentPage: number;
  } = $props();
</script>

<div class="flex justify-center w-full px-2">
  <Pagination.Root
    {count}
    perPage={DEFAULT_NUM_VIDEOS_TILES}
    bind:page={currentPage}
    onPageChange={(pageNum) =>
      updatePaginationQueryParams({ url: page.url, pageNum })}
  >
    {#snippet children({ pages })}
      <Pagination.Content class="flex-wrap justify-center gap-1">
        <Pagination.Item>
          <Pagination.PrevButton class="cursor-pointer" />
        </Pagination.Item>
        {#each pages as page (page.key)}
          {#if page.type === "ellipsis"}
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
