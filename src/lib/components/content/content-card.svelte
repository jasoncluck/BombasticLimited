<script lang="ts">
  import Progress from '../ui/progress/progress.svelte';
  import { getVideoSecondsOffset } from '../video/video-service';
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { userPreferences } from '$lib/state/user-preferences.svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import { ArrowDown, ArrowUp, Check, ListVideo } from '@lucide/svelte';
  import type { ContentDisplayProps } from './content';
  import ContentDropdown from './content-dropdown.svelte';
  import { goto } from '$app/navigation';
  import { getSortDisplayName } from './content-filter';
  import ContentCardSkeleton from './content-card-skeleton.svelte';
  import { getVideoThumbnailUrl } from '$lib/utils/video-thumbnails';
  import { onMount } from 'svelte';

  type ContentCardProps = {
    video?: Video;
    isLoading?: boolean;
  } & Pick<
    ContentDisplayProps,
    | 'isContinueVideos'
    | 'playlistContentFilter'
    | 'contentFilter'
    | 'videos'
    | 'playlists'
    | 'sectionId'
    | 'supabase'
    | 'session'
  > &
    HTMLAnchorAttributes;

  const {
    video,
    isLoading = false,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
  }: ContentCardProps = $props();

  const contentState = getContentState();

  let cardElement = $state<HTMLElement>();

  const selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  const hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  const isHovered = $derived(video && hoveredVideo?.id === video.id);
  const isSelected = $derived(
    video && selectedVideos.some((v) => v.id === video.id)
  );
  const isContextMenuOpen = $derived(
    contentState.isContextMenuOpenForSection(sectionId) && isSelected
  );
  const isDragActive = $derived(
    contentState.dragContentType === 'video' &&
      contentState.draggedFromSectionId === sectionId &&
      isHovered
  );

  // Show description when:
  // 1. Card is hovered (regardless of context menu state)
  // 2. Card has context menu open (and is selected)
  // 3. Card is being dragged
  const shouldShowDescription = $derived(
    isHovered || isSelected || isContextMenuOpen || isDragActive
  );

  // Check if mouse is already over the card when component mounts
  onMount(() => {
    if (video && cardElement) {
      let checkCount = 0;
      const maxChecks = 5;
      const initialDelay = 200;
      const recheckInterval = 100;

      // Check if the mouse cursor is currently positioned over this card element
      const checkMousePosition = () => {
        // Use CSS :hover pseudo-class to check if element is currently hovered
        const isCurrentlyHovered = cardElement?.matches(':hover');

        if (isCurrentlyHovered) {
          // Check if hover state was cleared (indicating a race condition occurred)
          const currentHoveredVideo =
            contentState.hoveredVideosBySection[sectionId];
          const isHoverStateCleared =
            !currentHoveredVideo || currentHoveredVideo.id !== video.id;

          if (isHoverStateCleared) {
            // Re-initialize hover state by calling the existing handleMouseEnter
            contentState.handleMouseEnter({
              video,
              sectionId,
            });
          }
        }
      };

      // Robust hover detection with multiple attempts
      const performHoverDetection = () => {
        checkMousePosition();
        checkCount++;

        // Continue checking periodically for a short time to handle race conditions
        if (checkCount < maxChecks) {
          setTimeout(performHoverDetection, recheckInterval);
        }
      };

      // Start with an initial delay to ensure most initialization callbacks have completed
      // Then perform periodic re-checks to handle any race conditions
      setTimeout(performHoverDetection, initialDelay);
    }
  });
</script>

{#if isLoading || !video}
  <ContentCardSkeleton />
{:else}
  <div
    bind:this={cardElement}
    class="group h-64 w-full transform cursor-pointer will-change-transform"
    data-testid="video-card"
  >
    <div role="button" tabindex="0" class="cursor-pointer text-left">
      <div class="relative">
        <img
          class="aspect-[16/9] h-auto w-full"
          src={getVideoThumbnailUrl(video)}
          alt={video.title}
          loading="lazy"
        />
        <div class="absolute top-0.5 right-0.5">
          <ContentDropdown
            videos={[video]}
            variant="list-items"
            {sectionId}
            {supabase}
            {session}
          />
        </div>
        {#if isVideoWithTimestamp(video) && !video.watched_at && video.video_start_seconds && video.duration}
          <Progress
            class="absolute -bottom-1 left-0 h-[2%]"
            value={Math.floor(
              getVideoSecondsOffset({
                duration: video.duration,
                timestampSeconds: video.video_start_seconds,
              })
            )}
          />
        {:else if 'watched_at' in video && video.watched_at}
          <div
            class="bg-background-lighter absolute right-0 bottom-0 flex
            w-full items-center justify-center gap-1 px-1"
          >
            <Check class="text-primary" />
            <p class="text-primary text-xs">Watched</p>
          </div>
        {/if}
      </div>

      <p class="p-2 text-sm">
        {video.title}
      </p>

      {#if isVideoWithTimestamp(video) && video.playlist_name && video.playlist_short_id}
        <div
          class="text-secondary-foreground hover:text-primary z-10 mt-1 mb-3 line-clamp-2 flex items-center gap-2 px-2 text-xs"
        >
          <ListVideo size="16" class="shrink-0 self-start" />
          <div class="flex w-full flex-col justify-center gap-2">
            <a
              onclick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                goto(`playlist/${video.playlist_short_id}`);
              }}
              href={`playlist/${video.playlist_short_id}`}
              class="flex items-center gap-2 truncate whitespace-normal"
            >
              <span class="truncate">{video.playlist_name}</span>
            </a>
            <div class="text-muted-foreground flex shrink-0 items-center">
              {#if video.playlist_sorted_by}
                <div class="flex shrink-0 items-center">
                  <span class="truncate text-xs">
                    {getSortDisplayName({
                      key: video.playlist_sorted_by,
                      view: 'playlist',
                    })}
                  </span>
                  {#if video.playlist_sort_order}
                    {#if video.playlist_sort_order === 'ascending'}
                      <ArrowUp size="14" class="ml-1 shrink-0" />
                      <span class="sr-only">Sorted Ascending</span>
                    {:else}
                      <ArrowDown size="14" class="ml-1 shrink-0" />
                      <span class="sr-only">Sorted Descending</span>
                    {/if}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <p
        class="text-muted-foreground pointer-events-none w-full transform px-2 text-xs/4 @sm:absolute
        {shouldShowDescription ? '@sm:invisible @sm:bg-transparent ' : 'block'}"
      >
        {new Date(video.published_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>

      <!-- Description overlay -->
      {#if userPreferences.contentDescription !== 'NONE'}
        <p
          class="pointer-events-none text-sm @sm:absolute @sm:opacity-0
      {shouldShowDescription ? '@sm:bg-secondary @sm:opacity-100' : ''}
      break-anywhere z-40 transform
      rounded-b-md px-4 whitespace-pre-line will-change-transform
      {userPreferences.contentDescription === 'BRIEF' &&
            'line-clamp-4 overflow-clip pb-1'}"
          style="left: -0.5rem; right: -0.5rem; width: auto;"
        >
          {video.description}
        </p>
      {/if}
    </div>
  </div>
{/if}
