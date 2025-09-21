<script lang="ts">
  import { page } from '$app/state';
  import { SOURCE_INFO } from '$lib/constants/source';
  import ContentHeader from '$lib/components/content/content-header.svelte';
  import Content from '$lib/components/content/content.svelte';
  import { type Video } from '$lib/supabase/videos.js';
  import type { Snapshot } from '@sveltejs/kit';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte.js';
  import { PAGINATION_QUERY_KEY } from '$lib/components/pagination/pagination.js';

  const { data } = $props();
  const {
    supabase,
    videos,
    videosCount,
    userProfile,
    session,
    source,
    contentFilter,
  } = $derived(data);

  const contentState = getContentState();

  const sectionId = DEFAULT_SECTION_ID;

  let showFloatingBreadcrumbs = $state(false);

  // Initialize currentPage from URL params
  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  // Update currentPage when URL changes (for browser back/forward support)
  $effect(() => {
    const urlPage = page.url.searchParams.get(PAGINATION_QUERY_KEY);
    const newPage = urlPage ? parseInt(urlPage) : 1;
    if (newPage !== currentPage) {
      currentPage = newPage;
    }
  });

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
    selectedVideos: Video[];
    currentPage: number;
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
        selectedVideos: contentState.selectedVideosBySection[sectionId],
        currentPage,
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
      if (restored?.selectedVideos) {
        contentState.selectedVideosBySection[sectionId] =
          restored.selectedVideos;
      }
      if (restored?.currentPage) {
        currentPage = restored.currentPage;
      }
    },
  };
</script>

<div class="relative">
  <ContentHeader
    heading="Latest Videos"
    subHeading={SOURCE_INFO[source].displayName}
    subHeadingHref={`/${source}`}
    {contentFilter}
    {videos}
    videosCount={videosCount ?? 0}
    {currentPage}
    {userProfile}
    {source}
    bind:showFloatingBreadcrumbs
    breadcrumbs={[
      {
        label: SOURCE_INFO[source].displayName,
        href: `/${page.params.source}`,
      },
      {
        label: 'Latest',
      },
    ]}
    {supabase}
    {session}
  />
  <Content
    {videos}
    {videosCount}
    tilesDisplay="TILES"
    {userProfile}
    {contentFilter}
    {supabase}
    {session}
  />
</div>
