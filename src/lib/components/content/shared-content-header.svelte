<script lang="ts">
  import { fade } from "svelte/transition";
  import { type BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import ContentFilters from "$lib/components/content/content-filter.svelte";
  import FloatingBreadcrumbs from "$lib/components/floating-breadcrumbs.svelte";
  import IntersectionObserver from "$lib/components/intersection-observer.svelte";
  import ContentSelect from "$lib/components/content/content-select.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { HTMLAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import ContentPagination from "./pagination/content-pagination.svelte";
  import { getNumberOfPages } from "./pagination/content-pagination";
  import { DEFAULT_NUM_VIDEOS_TILES } from "$lib/supabase/videos";
  import type { ContentView } from "./content";

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    view: ContentView;
    contentFilter: CombinedContentFilter;
    playlists: Playlist[];
    children: Snippet<[]>;
    playlist?: Playlist;
    videosCount: number;
    currentPage?: number;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }

  let {
    breadcrumbs,
    children,
    view,
    contentFilter,
    playlist,
    playlists,
    showFloatingBreadcrumbs = $bindable(),
    videosCount,
    currentPage = $bindable(),
    supabase,
    session,
    ...restProps
  }: SharedContentHeaderProps = $props();

  const numPages = $derived(
    getNumberOfPages({
      videosCount,
      videosPerPage: DEFAULT_NUM_VIDEOS_TILES,
    }),
  );
</script>

{#if showFloatingBreadcrumbs}
  <div transition:fade class="sticky w-full top-0 z-50 bg-background-lighter">
    <FloatingBreadcrumbs
      {breadcrumbs}
      {playlist}
      {playlists}
      {supabase}
      {session}
    />
  </div>
{/if}

<IntersectionObserver
  disableObserver={false}
  threshold={0.25}
  onActive={() => (showFloatingBreadcrumbs = false)}
  onInactive={() => (showFloatingBreadcrumbs = true)}
>
  <div
    class="flex flex-col md:flex-row md:flex-wrap justify-between gap-y-8"
    {...restProps}
  >
    {@render children()}
  </div>
  <div class="mb-4">
    {#if currentPage && numPages > 1}
      <ContentPagination count={videosCount} bind:currentPage />
    {/if}
  </div>
  <div class="flex flex-row justify-end items-start gap-4">
    <ContentSelect {playlist} {playlists} {supabase} {session} />
    <ContentFilters {contentFilter} {view} />
  </div>
</IntersectionObserver>
