<script lang="ts">
  import { type BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import ContentFilters from "$lib/components/content/content-filter.svelte";
  import FloatingBreadcrumbs from "$lib/components/floating-breadcrumbs.svelte";
  import IntersectionObserver from "$lib/components/intersection-observer.svelte";
  import ContentSelect from "$lib/components/content/content-select.svelte";
  import type {
    Playlist,
    ProfilePlaylist,
    UserPlaylist,
  } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { HTMLAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import ContentPagination from "./pagination/content-pagination.svelte";
  import { getNumberOfPages } from "./pagination/content-pagination";
  import {
    DEFAULT_NUM_VIDEOS_PAGINATION,
    isVideoWithTimestamp,
    type Video,
  } from "$lib/supabase/videos";
  import { handleContentNavigation, type ContentView } from "./content";
  import {
    handleFollowPlaylist,
    handleUnfollowPlaylist,
  } from "../playlist/playlist-service";
  import { MinusCircle, Play, PlusCircle } from "@lucide/svelte";
  import { fade } from "svelte/transition";
  import Button from "../ui/button/button.svelte";

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    children: Snippet<[]>;
    contentFilter: CombinedContentFilter;
    currentPage?: number;
    open?: boolean;
    playlists: Playlist[];
    playlist?: ProfilePlaylist | UserPlaylist;
    session: Session | null;
    showFloatingBreadcrumbs: boolean;
    supabase: SupabaseClient<Database>;
    videos: Video[];
    videosCount: number;
    view: ContentView;
  }

  let {
    breadcrumbs,
    children,
    contentFilter,
    currentPage = $bindable(),
    open = $bindable(),
    playlists,
    playlist: profilePlaylist,
    session,
    showFloatingBreadcrumbs = $bindable(),
    supabase,
    videos,
    videosCount,
    view,
    ...restProps
  }: SharedContentHeaderProps = $props();

  const isPlaylistCreator = $derived(
    profilePlaylist?.created_by === session?.user.id,
  );

  const numPages = $derived(
    getNumberOfPages({
      videosCount,
      videosPerPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    }),
  );

  const nextVideoToPlay = $derived(
    videos.find((v) => !isVideoWithTimestamp(v) || !v.watched_at),
  );

  function handlePlayVideo() {
    if (nextVideoToPlay) {
      handleContentNavigation({
        video: nextVideoToPlay,
        contentFilter,
        playlist: profilePlaylist,
      });
    }
  }
</script>

{#if showFloatingBreadcrumbs}
  <div
    transition:fade
    class="sticky w-full top-0 left-0 z-50 bg-background-lighter"
  >
    <FloatingBreadcrumbs
      {videos}
      {breadcrumbs}
      playlist={profilePlaylist}
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
  <div class="mb-6" {...restProps}>
    {@render children()}

    <!-- Right side: ContentSelect and ContentFilters on same row -->
    <hr class="border-1 m-4" />
    <div class="flex justify-between m-4 items-center gap-3">
      {#if profilePlaylist}
        <Button
          variant="ghost"
          size="icon"
          disabled={!nextVideoToPlay}
          class="p-7 bg-primary rounded-full shadow-xl transition-transform duration-200 hover:scale-105 hover:shadow-2xl
          hover:bg-primary hover:brightness-[150%]"
          onclick={handlePlayVideo}
        >
          <Play class="h-6! w-6! stroke-background fill-background" />
        </Button>
        {#if !isPlaylistCreator && !playlists.some((pl) => pl.id === profilePlaylist.id)}
          <PlusCircle
            class="ghost-button-minimal"
            size="30"
            onclick={() => {
              handleFollowPlaylist({
                playlist: profilePlaylist,
                supabase,
                session,
              });
            }}
          />
        {/if}
        {#if !isPlaylistCreator && playlists.some((pl) => pl.id === profilePlaylist.id)}
          <MinusCircle
            class="ghost-button-minimal"
            size="30"
            onclick={() => {
              handleUnfollowPlaylist({
                playlist: profilePlaylist,
                supabase,
                session,
              });
            }}
          />
        {/if}
      {/if}
      {#if session}
        <div class="relative">
          <ContentSelect
            {videos}
            playlist={profilePlaylist}
            {playlists}
            {supabase}
            {session}
            displayLabel={true}
          />
        </div>
      {/if}
      <div class="flex items-center gap-4 ml-auto">
        <ContentFilters
          {contentFilter}
          {view}
          playlist={profilePlaylist}
          {supabase}
          {session}
        />
      </div>
    </div>
    {#if currentPage && numPages > 1}
      <div class="mt-4">
        <ContentPagination count={videosCount} bind:currentPage />
      </div>
    {/if}
  </div>
</IntersectionObserver>
