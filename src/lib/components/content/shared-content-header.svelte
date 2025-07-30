<script lang="ts">
  import { type BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import ContentFilters from "$lib/components/content/content-filter.svelte";
  import FloatingBreadcrumbs from "$lib/components/floating-breadcrumbs.svelte";
  import IntersectionObserver from "$lib/components/intersection-observer.svelte";
  import ContentSelect from "$lib/components/content/content-select.svelte";
  import type { ProfilePlaylist, UserPlaylist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { HTMLAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import { handleContentNavigation, type ContentView } from "./content";
  import {
    handleFollowPlaylist,
    handleUnfollowPlaylist,
  } from "../playlist/playlist-service";
  import { MinusCircle, Play, PlusCircle } from "@lucide/svelte";
  import { fade } from "svelte/transition";
  import Button from "../ui/button/button.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import type { UserProfile } from "$lib/supabase/user-profiles";
  import { getSidebarState } from "$lib/state/sidebar.svelte";

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    children: Snippet<[]>;
    contentFilter: CombinedContentFilter;
    currentPage?: number;
    open?: boolean;
    playlist?: ProfilePlaylist | UserPlaylist;
    session: Session | null;
    showFloatingBreadcrumbs: boolean;
    userProfile: UserProfile | null;
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
    playlist: profilePlaylist,
    session,
    showFloatingBreadcrumbs = $bindable(),
    supabase,
    videos,
    videosCount,
    view,
    ...restProps
  }: SharedContentHeaderProps = $props();

  const sidebarState = getSidebarState();
  const { playlists } = $derived(sidebarState);

  const isPlaylistCreator = $derived(
    profilePlaylist?.created_by === session?.user.id,
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
  <div class="mb-2" {...restProps}>
    {@render children()}

    <div class="flex items-center mx-1 sm:my-4 gap-0">
      {#if profilePlaylist}
        <!-- Play Button -->
        <Button
          variant="ghost"
          size="icon"
          disabled={!nextVideoToPlay}
          class="mr-2 p-7 bg-primary rounded-full shadow-xl transition-transform 
        duration-200 hover:scale-105 hover:shadow-2xl
        hover:!bg-primary hover:brightness-[150%]"
          onclick={handlePlayVideo}
        >
          <Play
            class="h-6! w-6! stroke-background-lighter fill-background-lighter "
          />
        </Button>

        <!-- Plus/Minus Button -->
        {#if !isPlaylistCreator && !playlists.some((pl) => pl.id === profilePlaylist.id)}
          {#if !session?.user.id}
            <Popover.Root>
              <Popover.Trigger>
                <Button
                  variant="ghost"
                  class="ghost-button-minimal !px-3 !py-2"
                >
                  <PlusCircle class="!h-8 !w-8" />
                </Button>
              </Popover.Trigger>
              <Popover.Content>
                Create an account or login to follow playlists.
              </Popover.Content>
            </Popover.Root>
          {:else}
            <Button
              variant="ghost"
              class="ghost-button-minimal !px-3 !py-2"
              onclick={() => {
                handleFollowPlaylist({
                  playlist: profilePlaylist,
                  sidebarState,
                  contentFilter,
                  supabase,
                  session,
                });
              }}
            >
              <PlusCircle class="!h-8 !w-8" />
            </Button>
          {/if}
        {/if}
        {#if !isPlaylistCreator && playlists.some((pl) => pl.id === profilePlaylist.id)}
          <Button
            variant="ghost"
            class="ghost-button-minimal !px-3 !py-2"
            onclick={() => {
              handleUnfollowPlaylist({
                playlist: profilePlaylist,
                sidebarState,
                supabase,
                session,
              });
            }}
          >
            <MinusCircle class="!h-8 !w-8" />
          </Button>
        {/if}

        <!-- ContentSelect Button -->
        {#if session}
          <div class="relative">
            <ContentSelect
              {videos}
              playlist={profilePlaylist}
              {supabase}
              {session}
              displayLabel={true}
            />
          </div>
        {/if}
      {/if}

      <!-- Content Filters (pushed to the right) -->
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
  </div>
</IntersectionObserver>
