<script lang="ts">
  import * as Carousel from '$lib/components/ui/carousel';
  import ContentCard from './content-card.svelte';
  import {
    handleContentNavigation,
    type CarouselState,
    type ContentDisplayProps,
  } from './content';
  import type { CarouselAPI } from '../ui/carousel/context';
  import { onDestroy } from 'svelte';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import type { Video } from '$lib/supabase/videos';

  type ContentCarouselProps = ContentDisplayProps & {
    carouselState?: CarouselState;
    allowVideoReorder?: boolean;
    contentFilter: CombinedContentFilter;
  };

  let {
    videos,
    videosCount,
    sectionId = DEFAULT_SECTION_ID,
    isContinueVideos,
    playlist,
    playlists,
    playlistContentFilter,
    carouselState = $bindable(),
    allowVideoReorder = false,
    contentFilter,
    supabase,
    session,
  }: ContentCarouselProps = $props();

  const contentState = getContentState();

  const selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  const selectedVideoIds = $derived(
    selectedVideos.length > 0
      ? new Set(selectedVideos.map((v) => v.id))
      : new Set()
  );

  const hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  // Create drag drop functionality
  const dragDrop = contentState.createDragDrop({
    allowVideoReorder,
    videos,
    videosCount,
    playlist,
    contentFilter,
    supabase,
    clearSelection: true,
    onVideosUpdate: (updatedVideos) => {
      videos = updatedVideos;
    },
  });

  let api = $state<CarouselAPI>();
  let showPreviousButton = $state(false);
  let showNextButton = $state(videos.length > 0);
  let isInitializing = $state(true);
  let userInteracting = $state(false);
  let slidesInView = $state<number[]>([]);

  // Track slides in view for reactive updates
  $effect(() => {
    if (api) {
      const updateSlidesInView = () => {
        if (api) {
          slidesInView = api.slidesInView();
        }
      };

      updateSlidesInView();

      // Listen for changes
      api.on('slidesInView', updateSlidesInView);
      api.on('scroll', updateSlidesInView);

      return () => {
        if (api) {
          api.off('slidesInView', updateSlidesInView);
          api.off('scroll', updateSlidesInView);
        }
      };
    }
  });

  function isVideoIndexInView(videoIndex: number): boolean {
    if (!api) return false;
    const currentSlidesInView = api.slidesInView();
    return currentSlidesInView.includes(videoIndex);
  }

  function getFirstVisibleVideoIndex(): number {
    if (!api) return 0;
    const currentSlidesInView = api.slidesInView();
    return currentSlidesInView.length > 0 ? currentSlidesInView[0] : 0;
  }

  async function scrollToVideoIndex(targetVideoIndex: number) {
    if (!api || targetVideoIndex < 0 || targetVideoIndex >= videos.length)
      return;

    if (isVideoIndexInView(targetVideoIndex)) {
      updateButtonStates();
      isInitializing = false;
      return;
    }

    const currentSlidesInView = api.slidesInView();
    const itemsPerView = currentSlidesInView.length;
    const targetSnapIndex = Math.floor(targetVideoIndex / itemsPerView);

    api.scrollTo(targetSnapIndex);
    await new Promise((resolve) => setTimeout(resolve, 200));

    updateButtonStates();
    isInitializing = false;
  }

  function updateButtonStates() {
    if (api) {
      showPreviousButton = api.canScrollPrev();
      showNextButton = api.canScrollNext();
      contentState.selectedVideosBySection[sectionId] = [];
      contentState.hoveredVideosBySection[sectionId] = null;
      // Update slides in view
      slidesInView = api.slidesInView();
    }
  }

  async function waitForCarouselReady(
    api: CarouselAPI,
    maxWait = 2000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const currentSlidesInView = api.slidesInView();
      if (currentSlidesInView.length > 0) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return false;
  }

  $effect(() => {
    if (
      api &&
      isInitializing &&
      !userInteracting &&
      carouselState?.lastViewedIndex !== undefined &&
      carouselState.lastViewedIndex > -1
    ) {
      waitForCarouselReady(api).then((isReady) => {
        if (isReady) {
          scrollToVideoIndex(carouselState.lastViewedIndex);
        } else {
          isInitializing = false;
        }
      });
    }
  });

  onDestroy(() => {
    if (api) {
      if (carouselState && carouselState.lastViewedIndex === undefined) {
        const firstVisibleVideoIndex = getFirstVisibleVideoIndex();
        carouselState.lastViewedIndex = firstVisibleVideoIndex;
      }
      api.destroy();
    }
  });

  function handlePreviousButtonClick() {
    if (api) {
      userInteracting = true;
      isInitializing = false;

      api.scrollPrev();
      updateButtonStates();

      setTimeout(() => {
        userInteracting = false;
      }, 100);
    }
  }

  function handleNextButtonClick() {
    if (api) {
      userInteracting = true;
      isInitializing = false;

      api.scrollNext();
      updateButtonStates();

      setTimeout(() => {
        userInteracting = false;
      }, 100);
    }
  }

  function getItemClasses(video: Video, index: number) {
    const isSelected = selectedVideoIds.has(video.id);
    const isHovered = hoveredVideo?.id === video.id;
    const isInView = slidesInView.includes(index);

    let classes = `group @4xl:basis-1/5 @sm:basis-1/3 basis-full p-2 rounded-md outline-none `;

    // Only apply hover and selected states to cards that are in view
    if (isInView && (isSelected || isHovered)) {
      classes += ' !bg-secondary brightness-110';
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      classes += ` ${contentState.getVideoDragClasses(index, 'TILES')}`;
    }

    return classes;
  }

  // Add function to handle mouse leaving the entire carousel
  function handleCarouselMouseLeave() {
    contentState.hoveredVideosBySection[sectionId] = null;
    // Clear any pending timeout
    if (contentState.hoverTimeoutId) {
      clearTimeout(contentState.hoverTimeoutId);
      contentState.hoverTimeoutId = null;
    }
  }

  // Only allow mouse interactions on visible cards
  function handleMouseEnter(video: Video, index: number) {
    if (slidesInView.includes(index)) {
      contentState.handleMouseEnter({
        video,
        sectionId,
      });
    }
  }

  function handleMouseLeave(index: number) {
    if (slidesInView.includes(index)) {
      contentState.handleMouseLeave({
        sectionId,
      });
    }
  }

  function handleMouseDown(event: MouseEvent, video: Video, index: number) {
    // Only process if the video is currently visible in the carousel
    if (!slidesInView.includes(index)) {
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
</script>

<Carousel.Root
  opts={{
    slidesToScroll: 'auto',
    watchDrag: false,
    inViewThreshold: 0.5,
  }}
  class="z-40 overflow-x-clip"
  data-testid="video-carousel"
  setApi={(emblaApi) => {
    api = emblaApi;
  }}
  onmouseleave={handleCarouselMouseLeave}
>
  <Carousel.Previous
    class={showPreviousButton
      ? '!bg-secondary visible cursor-pointer hover:scale-105 hover:brightness-110'
      : 'invisible'}
    onclick={handlePreviousButtonClick}
  />
  <Carousel.Next
    onclick={handleNextButtonClick}
    class={showNextButton
      ? '!bg-secondary visible cursor-pointer hover:scale-105 hover:brightness-110'
      : 'invisible'}
  />
  <Carousel.Content>
    {#each videos as video, i (video.id)}
      <Carousel.Item
        class={getItemClasses(video, i)}
        data-testid="carousel-item"
        draggable="true"
        ondragstart={(e) => dragDrop.handleDragStart(e, i, sectionId)}
        ondragend={dragDrop.handleDragEnd}
        onmouseenter={() => handleMouseEnter(video, i)}
        onmouseleave={() => handleMouseLeave(i)}
        onmousedown={(e) => handleMouseDown(e, video, i)}
        onclick={(e) => {
          // Update carousel state before handling click
          if (carouselState) {
            carouselState.lastViewedIndex = i;
          }

          // Use the updated handleVideoClick with context menu handling
          contentState.handleVideoClick({
            event: e,
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
        }}
        oncontextmenu={(event) => {
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
        }}
      >
        <ContentCard
          {video}
          {videos}
          {playlistContentFilter}
          {playlists}
          {contentFilter}
          {isContinueVideos}
          {sectionId}
          {supabase}
          {session}
        />
      </Carousel.Item>
    {/each}
  </Carousel.Content>
</Carousel.Root>
