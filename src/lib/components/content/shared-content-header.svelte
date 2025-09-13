<script lang="ts">
  import { type BreadcrumbItem } from '$lib/components/breadcrumb-layout.svelte';
  import ContentFilters from '$lib/components/content/content-filter.svelte';
  import FloatingBreadcrumbs from '$lib/components/floating-breadcrumbs.svelte';
  import IntersectionObserver from '$lib/components/intersection-observer.svelte';
  import ContentSelect from '$lib/components/content/content-select.svelte';
  import type { Playlist, UserPlaylist } from '$lib/supabase/playlists';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import type { CombinedContentFilter } from './content-filter';
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import {
    getContentView,
    handleContentNavigation,
    type ContentView,
  } from './content';
  import {
    handleFollowPlaylist,
    handleUnfollowPlaylist,
  } from '../playlist/playlist-service';
  import { CircleMinus, CirclePlus, Play } from '@lucide/svelte';
  import { fade } from 'svelte/transition';
  import Button from '../ui/button/button.svelte';
  import * as Popover from '$lib/components/ui/popover';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    children: Snippet<[]>;
    contentFilter: CombinedContentFilter;
    currentPage?: number;
    open?: boolean;
    playlist?: Playlist | UserPlaylist;
    session: Session | null;
    showFloatingBreadcrumbs: boolean;
    userProfile: UserProfile | null;
    supabase: SupabaseClient<Database>;
    videos: Video[];
    view: ContentView;
  }

  let {
    breadcrumbs = [],
    children,
    contentFilter,
    currentPage = $bindable(),
    open = $bindable(),
    playlist: profilePlaylist,
    session,
    showFloatingBreadcrumbs = $bindable(),
    userProfile,
    supabase,
    videos,
    view,
    ...restProps
  }: SharedContentHeaderProps = $props();

  const sidebarState = getSidebarState();
  const mediaQueryState = getMediaQueryState();
  const { playlists } = $derived(sidebarState);

  const isPlaylistCreator = $derived(
    profilePlaylist?.created_by === session?.user.id
  );

  const nextVideoToPlay = $derived(
    videos.find((v) => !isVideoWithTimestamp(v) || !v.watched_at)
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
    class="bg-background-lighter sticky top-0 left-0 z-50 w-full"
  >
    <FloatingBreadcrumbs
      {videos}
      {breadcrumbs}
      playlist={profilePlaylist}
      {userProfile}
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
  <div class="mb-4" {...restProps}>
    {@render children()}

    <div class="my-4 flex items-center gap-0">
      <!-- Play Button -->
      <Button
        size="icon"
        disabled={!nextVideoToPlay}
        class="bg-primary hover:!bg-primary mr-2 rounded-full border-none p-7 
        shadow-xl transition-transform duration-200
        outline-none hover:scale-105 hover:shadow-2xl hover:brightness-[150%] focus:border-none focus:outline-none active:border-none active:outline-none"
        onclick={handlePlayVideo}
      >
        <Play class="h-6! w-6! fill-black stroke-0" />
      </Button>

      <!-- Plus/Minus Button -->
      {#if profilePlaylist}
        {#if !isPlaylistCreator && !playlists.some((pl) => pl.id === profilePlaylist.id)}
          {#if !session?.user.id}
            <Popover.Root>
              <Popover.Trigger>
                <Button
                  variant="ghost"
                  class="ghost-button-minimal !px-3 !py-2"
                >
                  <CirclePlus class="!h-8 !w-8" />
                </Button>
              </Popover.Trigger>
              <Popover.Content class="text-sm">
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
              <CirclePlus class="!h-8 !w-8" />
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
            <CircleMinus class="!h-8 !w-8" />
          </Button>
        {/if}
      {/if}

      <!-- ContentSelect Button -->
      {#if session && (getContentView(mediaQueryState, userProfile) === 'TABLE' || profilePlaylist)}
        <div class="relative">
          <ContentSelect
            {videos}
            playlist={profilePlaylist}
            {contentFilter}
            {supabase}
            {session}
            displayLabel={true}
          />
        </div>
      {/if}

      <!-- Content Filters (pushed to the right) -->
      <div class="ml-auto flex items-center gap-4">
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
