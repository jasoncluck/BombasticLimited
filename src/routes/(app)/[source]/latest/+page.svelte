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

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
    selectedVideos: Video[];
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
        selectedVideos: contentState.selectedVideosBySection[sectionId],
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
      contentState.selectedVideosBySection[sectionId] = restored.selectedVideos;
    },
  };
</script>

<div class="relative">
  <ContentHeader
    title="Latest Videos"
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
