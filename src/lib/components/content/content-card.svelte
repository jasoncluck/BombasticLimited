<script lang="ts">
  import Progress from "../ui/progress/progress.svelte";
  import { getVideoSecondsOffset } from "../video/video-service";
  import {
    isVideoWithTimestamp,
    type Video,
    type VideoWithTimestamp,
  } from "$lib/supabase/videos";
  import { userPreferences } from "$lib/state/user-preferences.svelte";
  import type { ContentDisplayProps } from "./content";
  import DeleteTimestampButton from "./delete-timestamp-button.svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import type { Playlist } from "$lib/supabase/playlists";
  import Checkbox from "../ui/checkbox/checkbox.svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import { pageState } from "$lib/state/page.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { getFilterKeysForView } from "./content-filter";

  type ContentCardProps = {
    video: Video | VideoWithTimestamp;
    playlist?: Playlist;
  } & Pick<
    ContentDisplayProps,
    | "isContinueVideos"
    | "playlist"
    | "playlistContentFilter"
    | "videos"
    | "playlists"
    | "supabase"
    | "session"
  > &
    HTMLAnchorAttributes;

  const {
    video = $bindable(),
    videos,
    playlist,
    isContinueVideos,
    supabase,
    session,
    ...restProps
  }: ContentCardProps = $props();

  const contentState = getContentState();

  let isHoveringCard = $state(false);
  // manual hover for overriding inconsistent browser hover behavior
  let manualHover = $state(false);

  function handleSelectVideos(event: MouseEvent) {
    const isShiftPressed = event.shiftKey;
    const videoIndex = contentState.selectedVideos.findIndex(
      (v) => v.id === video.id,
    );

    if (!isShiftPressed) {
      // Original behavior when SHIFT is not pressed
      if (videoIndex === -1) {
        contentState.selectedVideos.push(video);
      } else {
        contentState.selectedVideos.splice(videoIndex, 1);
      }
    } else {
      // SHIFT key is pressed - implement range selection
      // If no videos are selected yet, just add this one
      if (contentState.selectedVideos.length === 0) {
        contentState.selectedVideos.push(video);
      } else {
        const lastSelectedVideo =
          contentState.selectedVideos[contentState.selectedVideos.length - 1];

        const lastSelectedIndex = videos.findIndex(
          (v) => v.id === lastSelectedVideo.id,
        );
        const currentIndex = videos.findIndex((v) => v.id === video.id);

        // Determine start and end indices for the range
        const startIndex = Math.min(lastSelectedIndex, currentIndex);
        const endIndex = Math.max(lastSelectedIndex, currentIndex);

        // Select all videos in the range
        for (let i = startIndex; i <= endIndex; i++) {
          const rangeVideo = videos[i];
          // Check if this video is not already in selectedVideos
          if (
            !contentState.selectedVideos.some((v) => v.id === rangeVideo.id)
          ) {
            contentState.selectedVideos.push(rangeVideo);
          }
        }
      }
    }
  }

  function handleMouseEnter() {
    isHoveringCard = true;

    if (
      !contentState.isSelectionMode &&
      !contentState.dragContentType &&
      !pageState.contentScrollState.scrolling
    ) {
      // Clear any existing timeout when entering a new card
      if (contentState.hoverTimeoutId) {
        clearTimeout(contentState.hoverTimeoutId);
        contentState.hoverTimeoutId = null;
      }

      contentState.selectedVideos = [video];
    }

    if (
      !pageState.contentScrollState.scrolling &&
      contentState.dragContentType === null
    ) {
      manualHover = true;
    }
  }

  function handleMouseLeave() {
    manualHover = false; // Clear manual hover
    isHoveringCard = false;

    if (!contentState.isSelectionMode) {
      // Store the timeout ID so it can be cleared if needed
      const timeoutId = setTimeout(() => {
        if (
          !contentState.dragContentType &&
          !isHoveringCard &&
          !contentState.isMouseOverContextMenu
        ) {
          contentState.selectedVideos = [];
        }
        contentState.hoverTimeoutId = null;
      }, 50);
      contentState.hoverTimeoutId = timeoutId;
    }
  }

  $effect(() => {
    if (contentState.dragContentType) {
      manualHover = false;
    }
  });
</script>

<a
  class="group transition-transform duration-150 transform
  will-change-transform bg-background-lighter cursor-pointer block mb-6
  hover:z-auto {manualHover ? 'z-40' : ''} 
  flex @sm:flex-col gap-3 @sm:gap-0"
  onclick={contentState.isSelectionMode
    ? (e) => {
        e.preventDefault();
        handleSelectVideos(e);
      }
    : (e) => {
        e.preventDefault();

        if (playlist) {
          const targetUrl = new URL(
            `/playlist/${playlist.short_id}/${video.id}`,
            window.location.origin,
          );

          getFilterKeysForView("playlist").forEach((key) => {
            const searchParamForKey = page.url.searchParams.get(key);
            if (searchParamForKey) {
              targetUrl.searchParams.set(key, searchParamForKey);
            }
          });

          goto(targetUrl.pathname + targetUrl.search, {
            invalidate: ["supabase:db:videos"],
          });
        } else {
          goto(`/video/${video.id}`);
        }
      }}
  {...restProps}
>
  <!-- Image section - left side on row layout, top on card layout -->
  <div
    role="button"
    tabindex="0"
    class="text-left cursor-pointer flex-shrink-0 w-32 @sm:w-full"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
  >
    <div class="relative">
      <img
        class="w-full aspect-[16/9] h-auto {contentState.isSelectionMode &&
          'opacity-50'}"
        src={video.thumbnail_url}
        alt={video.title}
        loading="lazy"
      />
      {#if contentState.isSelectionMode}
        <div class="absolute top-0.5 right-0.5">
          <Checkbox
            id={video.id}
            checked={contentState.selectedVideos.some((v) => v.id === video.id)}
            class="mt-[2px] mr-[2px]"
          />
        </div>
      {:else if isVideoWithTimestamp(video) && video.video_start_seconds}
        <div class="absolute top-0.5 right-0.5">
          <DeleteTimestampButton
            {isContinueVideos}
            {manualHover}
            {video}
            {videos}
            {supabase}
            {session}
          />
        </div>
      {/if}
      {#if isVideoWithTimestamp(video) && video.video_start_seconds && video.duration}
        <Progress
          class="absolute bottom-0 left-0 h-[2%]"
          value={Math.floor(
            getVideoSecondsOffset({
              duration: video.duration,
              timestampSeconds: video.video_start_seconds,
            }),
          )}
        />
      {/if}
    </div>
  </div>

  <!-- Content section - right side on row layout, bottom on card layout -->
  <div class="flex-1 min-w-0 @sm:relative">
    <!-- Title -->
    <p
      class="text-sm p-2 @sm:bg-background-lighter transition-colors duration-150 ease-out
      {manualHover ? '@sm:bg-secondary' : ''}"
    >
      {video.title}
    </p>

    <!-- Date -->
    <p
      class="text-xs/4 text-muted-foreground px-2 @sm:bg-background-lighter
        @sm:group-hover:bg-transparent @sm:absolute pointer-events-none
        {manualHover ? '@sm:bg-secondary @sm:invisible' : ''}"
    >
      {new Date(video.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    </p>

    <!-- Description area - separate from hover trigger -->
    {#if userPreferences.contentDescription !== "NONE"}
      <p
        class="hidden @sm:block @sm:opacity-0 text-sm px-2 pb-2 @sm:p-2
      @sm:absolute @sm:w-full @sm:bg-transparent pointer-events-none
    {manualHover ? '@sm:opacity-100 @sm:bg-secondary ' : ''}
      transition-all ease-out duration-150 transform will-change-transform
      @sm:z-40 break-anywhere whitespace-pre-line
            {userPreferences.contentDescription === 'BRIEF' &&
          'line-clamp-3 @sm:py-1'}"
      >
        {video.description}
      </p>
    {/if}
  </div>
</a>
