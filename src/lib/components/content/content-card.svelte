<script lang="ts">
  import Progress from '../ui/progress/progress.svelte';
  import { getVideoSecondsOffset } from '../video/video-service';
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { userPreferences } from '$lib/state/user-preferences.svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
    type CarouselState,
  } from '$lib/state/content.svelte';
  import { ArrowDown, ArrowUp, Check, ListVideo } from '@lucide/svelte';
  import type { ContentDisplayProps } from './content';
  import ContentDropdown from './content-dropdown.svelte';
  import { goto, preloadData } from '$app/navigation';
  import { getSortDisplayName } from './content-filter';
  import ContentCardSkeleton from './content-card-skeleton.svelte';
  import { onMount } from 'svelte';
  import {
    handleContentNavigation,
    generateContentNavigationUrl,
  } from './content';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { UserProfile } from '$lib/supabase/user-profiles';

  type ContentCardProps = {
    video?: Video;
    isLoading?: boolean;
    // Drag and drop props
    allowVideoReorder?: boolean;
    index?: number;
    playlist?: Playlist;
    videosCount?: number | null;
    onVideosUpdate?: (videos: Video[]) => void;
    // Carousel-specific props
    isCarousel?: boolean;
    slidesInView?: number[];
    carouselState?: CarouselState;
    userProfile?: UserProfile;
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
    // Drag and drop props
    allowVideoReorder = false,
    index,
    playlist,
    videosCount,
    videos,
    contentFilter,
    onVideosUpdate,
    isCarousel = false,
    slidesInView,
    carouselState = $bindable(),
  }: ContentCardProps = $props();

  const contentState = getContentState();

  let cardElement = $state<HTMLElement>();
  let hasPreloaded = $state(false);

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

  // Create drag drop functionality when videos are available
  const dragDrop = $derived(
    videos && index !== undefined
      ? contentState.createDragDrop({
          allowVideoReorder,
          videos,
          videosCount,
          playlist,
          contentFilter,
          supabase,
          setDraggedAsSelected: false,
          clearSelection: true,
          onVideosUpdate,
        })
      : null
  );

  const selectedVideoIds = $derived(
    selectedVideos.length > 0
      ? new Set(selectedVideos.map((v) => v.id))
      : new Set()
  );

  // Check if this card is in view for carousel context
  const isInView = $derived(() => {
    if (!isCarousel || !slidesInView || index === undefined) {
      return true; // For tiles view, always consider in view
    }
    return slidesInView.includes(index);
  });

  // Show playlist info when hovering and playlist exists
  const shouldShowPlaylistInfo = $derived(
    (isHovered || isSelected || isContextMenuOpen || isDragActive) &&
      isVideoWithTimestamp(video) &&
      video.playlist_name &&
      video.playlist_short_id
  );

  // Show description when hovering but no playlist exists
  const shouldShowDescription = $derived(
    (isHovered || isSelected || isContextMenuOpen || isDragActive) &&
      userPreferences.contentDescription !== 'NONE' &&
      !(
        isVideoWithTimestamp(video) &&
        video.playlist_name &&
        video.playlist_short_id
      )
  );

  // Get CSS classes for drag drop styling
  function getCardClasses() {
    if (!video || index === undefined) return '';

    const isSelectedCard = selectedVideoIds.has(video.id);
    const isHoveredCard = hoveredVideo?.id === video.id;
    const isInViewCard = isInView();

    let classes = `group h-64 w-full transform cursor-pointer will-change-transform `;

    // Only apply hover and selected states to cards that are in view
    if (isInViewCard && (isSelectedCard || isHoveredCard)) {
      classes += ' z-40 bg-secondary/50 rounded-b-lg brightness-110';
    }

    // Add drag drop classes if enabled
    if (dragDrop) {
      classes += ` ${contentState.getVideoDragClasses(index, 'TILES')}`;
    }

    return classes;
  }

  // Preload content data
  async function preloadContent() {
    if (!video || hasPreloaded) return;

    try {
      const url = generateContentNavigationUrl({
        video,
        contentFilter,
        playlist,
      });
      await preloadData(url);
      hasPreloaded = true;
    } catch (error) {
      // Silently fail if preloading doesn't work
      console.debug('Preload failed:', error);
    }
  }

  // Mouse event handlers
  function handleMouseEnter() {
    if (!video) return;

    // For carousel, only handle if card is in view
    if (isCarousel && !isInView()) {
      return;
    }

    contentState.handleMouseEnter({
      video,
      sectionId,
    });

    // Preload content on hover
    preloadContent();
  }

  function handleMouseLeave() {
    // For carousel, only handle if card is in view
    if (isCarousel && !isInView()) {
      return;
    }

    contentState.handleMouseLeave({
      sectionId,
    });
  }

  function handleMouseDown(event: MouseEvent) {
    if (!video) return;

    // For carousel, only process if the video is currently visible
    if (isCarousel && !isInView()) {
      return;
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const isCurrentlySelected = selectedVideoIds.has(video.id);

    // If clicking on a video that is not currently selected or hovered, clear the states
    if (!isCurrentlySelected) {
      contentState.selectedVideosBySection[sectionId] = hoveredVideo
        ? [hoveredVideo]
        : [];
    }
  }

  function handleClick(event: MouseEvent) {
    if (!video || !videos) return;

    event.preventDefault();

    // Update carousel state before handling click if in carousel context
    if (isCarousel && carouselState && index !== undefined) {
      carouselState.lastViewedIndex = index;
    }

    // Use the updated handleVideoClick with context menu handling
    contentState.handleVideoClick({
      event,
      video,
      videos,
      playlist,
      sectionId,
      enableDoubleClick: false,
      onNavigate: (video, playlist) => {
        handleContentNavigation({
          video,
          contentFilter,
          playlist,
        });
      },
    });
  }

  function handleContextMenu(event: MouseEvent) {
    if (!video) return;

    const isCtrlPressed = event.ctrlKey || event.metaKey;

    if (isCtrlPressed) {
      event.preventDefault();
      event.stopPropagation();
      return;
    } else {
      // Handle right-click context menu behavior
      contentState.handleContextMenu({
        video,
        sectionId,
      });
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!video || !videos) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // Trigger the same logic as onclick
      contentState.handleVideoClick({
        event,
        video,
        videos,
        playlist,
        sectionId,
        enableDoubleClick: true,
        onNavigate: (video, playlist) => {
          handleContentNavigation({
            video,
            contentFilter,
            playlist,
          });
        },
      });
    }
  }

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
    class="{getCardClasses()} flex flex-col"
    data-testid="video-card"
    role="button"
    tabindex="0"
    draggable={!!dragDrop}
    ondragstart={dragDrop && index !== undefined
      ? (e) => dragDrop.handleDragStart(e, index, sectionId)
      : undefined}
    ondragover={dragDrop && index !== undefined
      ? (e) => dragDrop.handleDragOver(e, index)
      : undefined}
    ondragleave={dragDrop ? (e) => dragDrop.handleDragLeave(e) : undefined}
    ondrop={dragDrop && index !== undefined
      ? (e) => dragDrop.handleDrop(e, index, sectionId)
      : undefined}
    ondragend={dragDrop ? dragDrop.handleDragEnd : undefined}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    onmousedown={handleMouseDown}
    onclick={handleClick}
    oncontextmenu={handleContextMenu}
    onkeydown={handleKeyDown}
  >
    <div class="flex flex-1 cursor-pointer flex-col overflow-hidden text-left">
      <div class="relative flex-shrink-0">
        <!-- Use the optimized image_url directly from the database -->
        <img
          class="aspect-[16/9] h-auto w-full"
          src={video.image_url ?? video.thumbnail_url}
          alt={video.title}
          loading="eager"
          fetchpriority="high"
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

      <p class="flex-shrink-0 p-2 text-sm/5 tracking-tight">
        {video.title}
      </p>

      <!-- Date/Description section with flex-1 to fill remaining space -->
      <div class="flex flex-1 flex-col justify-start overflow-hidden px-2 pb-2">
        {#if shouldShowPlaylistInfo}
          <!-- Show playlist info when hovering and playlist exists -->
          <div class="text-secondary-foreground flex flex-col gap-1 text-xs">
            <div class="flex items-center gap-2">
              <ListVideo size="14" class="shrink-0" />
              <span class="truncate font-medium"
                >{isVideoWithTimestamp(video) ? video.playlist_name : ''}</span
              >
            </div>
            {#if isVideoWithTimestamp(video) && video.playlist_sorted_by}
              <div class="text-muted-foreground flex items-center gap-1 pl-5">
                <span class="text-xs">
                  {getSortDisplayName({
                    key: video.playlist_sorted_by,
                    view: 'playlist',
                  })}
                </span>
                {#if video.playlist_sort_order}
                  {#if video.playlist_sort_order === 'ascending'}
                    <ArrowUp size="12" class="shrink-0" />
                    <span class="sr-only">Sorted Ascending</span>
                  {:else}
                    <ArrowDown size="12" class="shrink-0" />
                    <span class="sr-only">Sorted Descending</span>
                  {/if}
                {/if}
              </div>
            {/if}
          </div>
        {:else if shouldShowDescription}
          <!-- Show description when hovering and no playlist exists -->
          <div
            class="pointer-events-none line-clamp-3 transform
            overflow-hidden text-xs leading-normal tracking-tight break-words will-change-transform"
          >
            {video.description}
          </div>
        {:else}
          <!-- Show date by default -->
          <p
            class="text-muted-foreground pointer-events-none text-xs leading-5"
          >
            {new Date(video.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        {/if}
      </div>

      <!-- Playlist section with flex-shrink-0 to prevent compression -->
      {#if isVideoWithTimestamp(video) && video.playlist_name && video.playlist_short_id}
        <div
          class="text-secondary-foreground hover:text-primary z-10 mt-1 mb-3 line-clamp-2 flex flex-shrink-0 items-center gap-2 px-2 text-xs"
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
              class="flex cursor-pointer items-center gap-2 truncate whitespace-normal"
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
    </div>
  </div>
{/if}
