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
  import { ArrowDown, ArrowUp, Check, ListVideo, Circle } from '@lucide/svelte';
  import type { ContentDisplayProps } from './content';
  import ContentDropdown from './content-dropdown.svelte';
  import { preloadData } from '$app/navigation';
  import {
    getSortDisplayName,
    type PlaylistVideosFilter,
  } from './content-filter';
  import ContentCardSkeleton from './content-card-skeleton.svelte';
  import LazyImage from './LazyImage.svelte';
  import { onMount } from 'svelte';
  import {
    handleContentNavigation,
    generateContentNavigationUrl,
  } from './content';
  import { handlePlaylistNavigationByShortId } from '$lib/components/playlist/playlist';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { UserProfile } from '$lib/supabase/user-profiles';

  type ContentCardProps = {
    video?: Video;
    isLoading?: boolean;
    // Drag and drop props
    allowVideoReorder?: boolean;
    isContinueVideos?: boolean;
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
    isContinueVideos,
    onVideosUpdate,
    isCarousel = false,
    slidesInView,
    carouselState = $bindable(),
  }: ContentCardProps = $props();

  const contentState = getContentState();

  let cardElement = $state<HTMLElement>();

  const isVideoInPlaylist = $derived(
    isContinueVideos &&
      isVideoWithTimestamp(video) &&
      video.playlist_name &&
      video.playlist_short_id
  );

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

    let classes = `group w-full outline-primary transform cursor-pointer will-change-transform h-68`;

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

  // Preload content data and images
  async function preloadContent() {
    if (!video) return;

    try {
      // Preload navigation data
      const url = generateContentNavigationUrl({
        video,
        contentFilter,
        playlist,
      });
      await preloadData(url);
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

    if (isCtrlPressed || !session) {
      event.preventDefault();
      event.stopPropagation();
      contentState.selectedVideosBySection[sectionId] = [];
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
    data-testid="content-item"
    data-video-id={video.id}
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
    <div
      class="mx-1 mt-1 flex flex-1 cursor-pointer flex-col overflow-hidden text-left"
    >
      <!-- Image container with fallback and consistent dropdown positioning -->
      <div class="relative flex-shrink-0">
        {#if video.image_url ?? video.thumbnail_url}
          <!-- Use the optimized image_url directly from the database -->
          <LazyImage
            src={video.image_url ?? video.thumbnail_url}
            alt={video.title}
            class="aspect-[16/9] h-auto w-full"
            {index}
          />
        {:else}
          <!-- Fallback placeholder when no image is available -->
          <div
            class="bg-muted flex aspect-[16/9] h-auto w-full items-center justify-center"
            aria-label="No thumbnail available"
          >
            <div class="text-muted-foreground text-sm">No Image</div>
          </div>
        {/if}

        <!-- Dropdown positioned absolutely, always renders regardless of image state -->
        <div class="absolute top-0.5 right-0.5 z-10">
          <ContentDropdown
            videos={[video]}
            variant="list-items"
            {playlist}
            {sectionId}
            {supabase}
            {session}
          />
        </div>

        <!-- Progress and watched indicators -->
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
            w-full items-center justify-center px-1"
          >
            <Check class="text-primary" />
            <p class="text-primary text-xs">Watched</p>
          </div>
        {/if}
      </div>

      <p class="mt-2 flex-shrink-0 p-2 text-sm tracking-tight">
        {video.title}
      </p>

      <!-- Date/Description section with flex-1 to fill remaining space -->
      <div class="flex flex-1 flex-col justify-start overflow-hidden px-2 pb-2">
        {#if shouldShowDescription}
          <!-- Show description when hovering and no playlist exists -->
          <div
            class="pointer-events-none transform overflow-hidden
            text-xs leading-normal tracking-tight break-words will-change-transform
            {video.title.length > 70
              ? 'line-clamp-1'
              : video.title.length > 30
                ? 'line-clamp-2'
                : 'line-clamp-3'}"
          >
            {video.description}
          </div>
        {:else if !isVideoInPlaylist}
          <!-- Show date by default -->
          <p
            class="text-muted-foreground pointer-events-none text-xs tracking-tight"
          >
            {new Date(video.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        {/if}

        <!-- Playlist section with flex-shrink-0 to prevent compression -->
        {#if isVideoInPlaylist && isVideoWithTimestamp(video)}
          <div
            class="text-secondary-foreground z-10 flex flex-shrink-0 items-center gap-2 text-xs"
          >
            <a
              onclick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (
                  video.playlist_short_id &&
                  video.playlist_sorted_by &&
                  video.playlist_sort_order
                ) {
                  const playlistContentFilter: PlaylistVideosFilter = {
                    type: 'playlist',
                    sort: {
                      key: video.playlist_sorted_by,
                      order: video.playlist_sort_order,
                    },
                  };
                  handlePlaylistNavigationByShortId({
                    playlistShortId: video.playlist_short_id,
                    contentFilter: playlistContentFilter ?? {
                      type: 'playlist',
                      sort: { key: 'playlistOrder', order: 'ascending' },
                    },
                  });
                }
              }}
              href={`playlist/${video.playlist_short_id}`}
              class="hover:text-primary flex items-center gap-2 truncate tracking-tight whitespace-normal"
            >
              <ListVideo size="16" class="shrink-0" />
              <span class="truncate">{video.playlist_name}</span>
            </a>
            <div
              class="text-muted-foreground flex shrink-0 items-center tracking-tight"
            >
              {#if video.playlist_sorted_by}
                <Circle
                  size="5"
                  class="stroke-muted-foreground fill-muted-foreground mr-2 shrink-0 justify-center"
                />
                <div class="flex shrink-1 items-center">
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
        {/if}
      </div>
    </div>
  </div>
{/if}
