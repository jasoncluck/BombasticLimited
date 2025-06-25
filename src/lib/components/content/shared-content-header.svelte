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
  import { Ellipsis } from "@lucide/svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { buttonVariants } from "../ui/button";
  import { handleDeletePlaylist } from "../playlist/playlist-service";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    view: ContentView;
    contentFilter: CombinedContentFilter;
    playlists: Playlist[];
    children: Snippet<[]>;
    playlist?: Playlist;
    openPlaylistModal?: () => void;
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
    openPlaylistModal,
    showFloatingBreadcrumbs = $bindable(),
    videosCount,
    currentPage = $bindable(),
    supabase,
    session,
    ...restProps
  }: SharedContentHeaderProps = $props();

  const mediaQueryState = getMediaQueryState();

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
  threshold={0.75}
  onActive={() => (showFloatingBreadcrumbs = false)}
  onInactive={() => (showFloatingBreadcrumbs = true)}
>
  <div
    class="flex flex-col m-4 md:flex-row md:flex-wrap justify-between gap-y-8 mb-2"
    {...restProps}
  >
    {@render children()}
  </div>
  <div class="flex justify-between items-center">
    <!-- Left side: Playlist actions -->
    <div class="flex items-center">
      {#if playlist}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="cursor-pointer {buttonVariants({
              variant: 'ghost',
              size: 'icon',
            })}"
          >
            <Ellipsis size="16" />
            <span class="sr-only">Playlist Actions</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Group>
              {#if openPlaylistModal}
                <DropdownMenu.Item
                  class="cursor-pointer"
                  onclick={openPlaylistModal}
                >
                  Edit Playlist</DropdownMenu.Item
                >
              {/if}
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() =>
                  handleDeletePlaylist({ playlist, supabase, session })}
                >Delete Playlist</DropdownMenu.Item
              >
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>

    <!-- Right side: ContentSelect and ContentFilters on same row -->
    <div class="flex items-center gap-4 ml-auto">
      {#if session && !mediaQueryState.isTouchDevice}
        <ContentSelect {playlist} {playlists} {supabase} {session} />
      {/if}
      <ContentFilters {contentFilter} {view} />
    </div>
  </div>
  <div class="mt-4 mb-6">
    {#if currentPage && numPages > 1}
      <ContentPagination count={videosCount} bind:currentPage />
    {/if}
  </div>
</IntersectionObserver>
