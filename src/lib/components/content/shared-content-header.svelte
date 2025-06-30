<script lang="ts">
  import { type BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import ContentFilters from "$lib/components/content/content-filter.svelte";
  import FloatingBreadcrumbs from "$lib/components/floating-breadcrumbs.svelte";
  import IntersectionObserver from "$lib/components/intersection-observer.svelte";
  import ContentSelect from "$lib/components/content/content-select.svelte";
  import type { Playlist, ProfilePlaylist } from "$lib/supabase/playlists";
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
  import gsap from "gsap";
  import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

  import {
    handleDeletePlaylist,
    handleFollowPlaylist,
    handleUnfollowPlaylist,
  } from "../playlist/playlist-service";
  import { Ellipsis, MinusCircle, Play, PlusCircle } from "@lucide/svelte";
  import { buttonVariants } from "../ui/button";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Button from "../ui/button/button.svelte";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";

  interface SharedContentHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    view: ContentView;
    contentFilter: CombinedContentFilter;
    playlists: Playlist[];
    open: boolean;
    children: Snippet<[]>;
    profilePlaylist?: ProfilePlaylist;
    videosCount: number;
    onPlayVideo: () => void;
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
    profilePlaylist,
    playlists,
    showFloatingBreadcrumbs = $bindable(),
    videosCount,
    onPlayVideo,
    currentPage = $bindable(),
    supabase,
    session,
    ...restProps
  }: SharedContentHeaderProps = $props();

  onMount(() => {
    gsap.registerPlugin(MorphSVGPlugin);
  });

  const isPlaylistCreator = $derived(
    profilePlaylist?.created_by === session?.user.id,
  );

  const numPages = $derived(
    getNumberOfPages({
      videosCount,
      videosPerPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    }),
  );

  // For morphing Plus <-> Minus
  let morphIconPath = $state<SVGPathElement>();
  let isPlus = true;
  // SVG path data for Plus and Minus (same viewBox, compatible points)
  // These are illustrative, you may want more elaborate paths for fancy icons.
  // For lucide/feather icons, you may need to convert to single path for smooth morph.
  const plusPath = "M8 12h8"; // Plus (+)
  const minusPath = "M5 12h14"; // Minus (−)

  // Helper: returns true if the current user follows this playlist
  const isFollowingPlaylist = $derived(
    playlists.some((pl) => pl.id === profilePlaylist?.id),
  );

  // Animate morph between plus/minus on click or change
  function morphToMinus() {
    if (morphIconPath) {
      gsap.to(morphIconPath, {
        duration: 0.4,
        morphSVG: { shape: minusPath },
        ease: "power1.inOut",
      });
      isPlus = false;
    }
  }
  function morphToPlus() {
    if (morphIconPath) {
      gsap.to(morphIconPath, {
        duration: 0.4,
        morphSVG: { shape: plusPath },
        ease: "power1.inOut",
      });
      isPlus = true;
    }
  }

  // When playlists or profilePlaylist change, trigger morph if needed
  $effect(() => {
    if (profilePlaylist) {
      if (!isPlaylistCreator) {
        if (isFollowingPlaylist && isPlus) {
          console.log("morph to minus");
          morphToMinus();
        }
        if (!isFollowingPlaylist && !isPlus) {
          console.log("morph to plus");
          morphToPlus();
        }
      }
    }
  });

  // On mount, set correct icon
  onMount(() => {
    if (profilePlaylist && !isPlaylistCreator && isFollowingPlaylist) {
      morphToMinus();
    }
  });

  function handleMorphClick() {
    if (!isFollowingPlaylist && profilePlaylist) {
      handleFollowPlaylist({
        playlist: profilePlaylist,
        supabase,
        session,
      });
    } else if (profilePlaylist) {
      handleUnfollowPlaylist({
        playlist: profilePlaylist,
        supabase,
        session,
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
  <div class="mb-6">
    <div
      class="flex flex-col m-4 md:flex-row md:flex-wrap justify-between gap-y-8 mb-2"
      {...restProps}
    >
      {@render children()}
    </div>

    <!-- Right side: ContentSelect and ContentFilters on same row -->
    <hr class="border-1 m-4" />
    <div class="flex justify-between m-4 items-center gap-3">
      {#if profilePlaylist}
        <Button
          variant="ghost"
          size="icon"
          class=" p-7 bg-primary rounded-full shadow-xl transition-transform duration-200 hover:scale-105 hover:shadow-2xl
          hover:bg-primary hover:brightness-[150%]"
          onclick={onPlayVideo}
        >
          <Play class="h-6! w-6! stroke-background fill-background" />
        </Button>
        {#if !isPlaylistCreator}
          <!-- GSAP Morph button: morphs between plus and minus -->
          <button
            type="button"
            aria-label={isFollowingPlaylist
              ? "Unfollow playlist"
              : "Follow playlist"}
            class={buttonVariants({
              variant: "ghost",
              size: "icon",
              class: "ghost-button-minimal",
            })}
            onclick={handleMorphClick}
            style="outline:none;"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              stroke="currentColor"
              fill="none"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                bind:this={morphIconPath}
                d="M12 5v14M5 12h14"
                style="transition:stroke 0.2s;"
              />
            </svg>
          </button>
        {/if}
        {#if isPlaylistCreator}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class={buttonVariants({
                variant: "ghost",
                size: "icon",
                class: "ghost-button-minimal",
              })}
            >
              <Ellipsis size="30" />
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
                  onclick={async () => {
                    const data = await handleDeletePlaylist({
                      playlist: profilePlaylist,
                      supabase,
                      session,
                    });

                    if (
                      !data?.error &&
                      page.url.pathname ===
                        `/playlist/${profilePlaylist.short_id}`
                    ) {
                      goto("/");
                    }
                  }}
                >
                  Delete Playlist
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      {/if}
      {#if session}
        <div class="mr-auto">
          <ContentSelect
            playlist={profilePlaylist}
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
