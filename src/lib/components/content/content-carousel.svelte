<script lang="ts">
  import * as Carousel from '$lib/components/ui/carousel';
  import ContentCard from './content-card.svelte';
  import { type CarouselState, type ContentDisplayProps } from './content';
  import type { CarouselAPI } from '../ui/carousel/context';
  import { onDestroy, onMount } from 'svelte';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import { browser } from '$app/environment';

  type ContentCarouselProps = ContentDisplayProps & {
    carouselState?: CarouselState;
    allowVideoReorder?: boolean;
    contentFilter: CombinedContentFilter;
  };

  let {
    videos = $bindable(),
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

  let api = $state<CarouselAPI>();
  let showPreviousButton = $state(false);
  let showNextButton = $state(false);
  let isInitializing = $state(true);
  let userInteracting = $state(false);
  let slidesInView = $state<number[]>([]);

  // Window resize handler - set up once on mount
  onMount(() => {
    if (browser) {
      const handleResize = () => {
        // Debounce the resize handler
        setTimeout(() => {
          if (api && !isInitializing) {
            updateButtonStates();
          }
        }, 150);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  });

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
      api.on('select', updateSlidesInView);
      api.on('reInit', updateSlidesInView);

      return () => {
        if (api) {
          api.off('slidesInView', updateSlidesInView);
          api.off('scroll', updateSlidesInView);
          api.off('select', updateSlidesInView);
          api.off('reInit', updateSlidesInView);
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
    if (api && videos.length > 0) {
      showPreviousButton = api.canScrollPrev();
      showNextButton = api.canScrollNext();
      contentState.selectedVideosBySection[sectionId] = [];
      contentState.hoveredVideosBySection[sectionId] = null;
      // Update slides in view
      slidesInView = api.slidesInView();
    } else {
      showPreviousButton = false;
      showNextButton = false;
    }
  }

  // Listen for viewport changes that might affect items per view
  $effect(() => {
    if (api && !isInitializing && !userInteracting) {
      // Add a small delay to allow for layout changes
      const timeoutId = setTimeout(() => {
        updateButtonStates();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  });

  // Listen for API changes to update button states
  $effect(() => {
    if (api) {
      const handleSelect = () => {
        updateButtonStates();
      };

      const handleReInit = () => {
        updateButtonStates();
      };

      api.on('select', handleSelect);
      api.on('reInit', handleReInit);

      // Initial update
      updateButtonStates();

      return () => {
        if (api) {
          api.off('select', handleSelect);
          api.off('reInit', handleReInit);
        }
      };
    }
  });

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
      carouselState &&
      carouselState.lastViewedIndex !== undefined &&
      carouselState.lastViewedIndex > -1
    ) {
      waitForCarouselReady(api).then((isReady) => {
        if (isReady && carouselState) {
          scrollToVideoIndex(carouselState.lastViewedIndex);
        } else {
          isInitializing = false;
          updateButtonStates();
        }
      });
    } else if (api && isInitializing) {
      // If no carousel state, just update button states after initialization
      waitForCarouselReady(api).then(() => {
        isInitializing = false;
        updateButtonStates();
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

  // Add function to handle mouse leaving the entire carousel
  function handleCarouselMouseLeave() {
    contentState.hoveredVideosBySection[sectionId] = null;
    // Clear any pending timeout
    if (contentState.hoverTimeoutId) {
      clearTimeout(contentState.hoverTimeoutId);
      contentState.hoverTimeoutId = null;
    }
  }
</script>

<Carousel.Root
  opts={{
    slidesToScroll: 'auto',
    watchDrag: false,
    inViewThreshold: 0.5,
  }}
  class="z-40"
  data-testid="video-carousel"
  setApi={(emblaApi) => {
    api = emblaApi;
  }}
  onmouseleave={handleCarouselMouseLeave}
>
  <Carousel.Previous
    class={showPreviousButton
      ? '!bg-secondary visible cursor-pointer opacity-75 \
      transition-opacity duration-150 hover:scale-105 \
      hover:opacity-100 hover:brightness-110'
      : 'invisible'}
    onclick={handlePreviousButtonClick}
  />
  <Carousel.Next
    onclick={handleNextButtonClick}
    class={showNextButton
      ? '!bg-secondary visible cursor-pointer opacity-75 \
      transition-all duration-150 hover:scale-105 \
      hover:opacity-100 hover:brightness-110'
      : 'invisible'}
  />
  <Carousel.Content class="ml-1">
    {#each videos as video, i (video.id)}
      <Carousel.Item
        class="group basis-full rounded-md pr-2 outline-hidden @sm:basis-1/3 @4xl:basis-1/5 {i ===
        0
          ? 'overflow-visible'
          : ''}"
        data-testid="carousel-item"
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
          {allowVideoReorder}
          index={i}
          {playlist}
          {videosCount}
          onVideosUpdate={(updatedVideos) => {
            videos = updatedVideos;
          }}
          isCarousel={true}
          {slidesInView}
          bind:carouselState
        />
      </Carousel.Item>
    {/each}
  </Carousel.Content>
</Carousel.Root>
