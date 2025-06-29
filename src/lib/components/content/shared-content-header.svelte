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
  import { DEFAULT_NUM_VIDEOS_PAGINATION } from "$lib/supabase/videos";
  import type { ContentView } from "./content";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { handleDeletePlaylist } from "../playlist/playlist-service";
  import { Ellipsis, Play } from "@lucide/svelte";
  import { buttonVariants } from "../ui/button";

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    view: ContentView;
    contentFilter: CombinedContentFilter;
    playlists: Playlist[];
    open: boolean;
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
    open = $bindable(),
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
      videosPerPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    }),
  );
</script>

{#if showFloatingBreadcrumbs}
  <div
    transition:fade
    class="sticky w-full top-0 left-0 z-50 bg-background-lighter"
  >
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
  threshold={0.1}
  onActive={() => (showFloatingBreadcrumbs = false)}
  onInactive={() => (showFloatingBreadcrumbs = true)}
>
  <div class="mb-6">
    <div
      class="flex flex-col m-4 md:flex-row md:flex-wrap justify-between gap-y-8 mb-2"
      {...restProps}
    >
      {@render children()}
    </div>

    <!-- Right side: ContentSelect and ContentFilters on same row -->
    <hr class="border-1 m-4" />
    <div class="flex justify-between m-4 items-center gap-2">
      {#if session && playlist}
        <!-- Action row: move Ellipsis here -->
        <Play size="30" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class={buttonVariants({
              variant: "ghost",
              class: "cursor-pointer ",
              size: "icon",
            })}
          >
            <Ellipsis size="16" />
            <span class="sr-only">Playlist Actions</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Group>
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() => (open = true)}
              >
                Edit Playlist
              </DropdownMenu.Item>
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() =>
                  handleDeletePlaylist({ playlist, supabase, session })}
              >
                Delete Playlist
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
      {#if session}
        <div class="mr-auto">
          <ContentSelect
            {playlist}
            {playlists}
            {supabase}
            {session}
            displayLabel={true}
          />
        </div>
      {/if}
      <div class="flex items-center gap-4 ml-auto">
        <ContentFilters {contentFilter} {view} />
      </div>
    </div>
    {#if currentPage && numPages > 1}
      <div class="mt-4">
        <ContentPagination count={videosCount} bind:currentPage />
      </div>
    {/if}
  </div>
</IntersectionObserver>
