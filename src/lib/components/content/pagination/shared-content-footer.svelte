<script lang="ts">
  import ContentPagination from "./content-pagination.svelte";

  let {
    currentPage = $bindable(),
    numPages,
    videosCount,
  }: { currentPage: number; numPages: number; videosCount: number } = $props();
</script>

<div class="mt-6">
  {#if currentPage && numPages > 1}
    <ContentPagination count={videosCount} bind:currentPage />
  {/if}
</div>
