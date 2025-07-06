<script lang="ts">
  import { DEFAULT_NUM_VIDEOS_PAGINATION } from "$lib/supabase/videos";
  import Pagination from "./pagination.svelte";

  let {
    currentPage = $bindable(),
    numPages,
    videosCount,
  }: { currentPage: number; numPages: number; videosCount: number } = $props();
</script>

<div class="mt-6">
  {#if currentPage && numPages > 1}
    <Pagination
      count={videosCount}
      bind:currentPage
      perPage={DEFAULT_NUM_VIDEOS_PAGINATION}
    />
  {/if}
</div>
