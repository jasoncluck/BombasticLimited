<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO } from "$lib/constants/source";
  import ContentHeader from "$lib/components/content/content-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "../$types.js";
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
  } from "$lib/components/content/pagination/content-pagination.js";
  import SharedContentFooter from "$lib/components/content/pagination/shared-content-footer.svelte";
  import { DEFAULT_NUM_VIDEOS_TILES } from "$lib/supabase/videos.js";

  const { data } = $props();
  const {
    supabase,
    videos,
    videosCount,
    playlists,
    session,
    source,
    contentFilter,
  } = $derived(data);

  let showFloatingBreadcrumbs = $state(false);

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1,
  );

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
    },
  };
  const numPages = $derived(
    getNumberOfPages({
      videosCount: videosCount ?? 0,
      videosPerPage: DEFAULT_NUM_VIDEOS_TILES,
    }),
  );
</script>

<div>
  <ContentHeader
    title="Latest Videos"
    {contentFilter}
    videosCount={videosCount ?? 0}
    {currentPage}
    {source}
    bind:showFloatingBreadcrumbs
    breadcrumbs={[
      {
        label: SOURCE_INFO[source].displayName,
        href: `/${page.params.source}`,
      },
      {
        label: "Latest",
      },
    ]}
    {playlists}
    {supabase}
    {session}
  />
  <Content
    {videos}
    {videosCount}
    contentDisplay="TILES"
    {contentFilter}
    {playlists}
    {supabase}
    {session}
  />
  {#if currentPage && numPages > 1}
    <SharedContentFooter
      bind:currentPage
      {numPages}
      videosCount={videosCount ?? 0}
    />
  {/if}
</div>
