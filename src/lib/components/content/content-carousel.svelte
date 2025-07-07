<script lang="ts">
  import * as Carousel from "$lib/components/ui/carousel";
  import ContentCard from "./content-card.svelte";
  import { type CarouselState, type ContentDisplayProps } from "./content";
  import type { CarouselAPI } from "../ui/carousel/context";
  import { onDestroy } from "svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import type { Video } from "$lib/supabase/videos";

  type ContentCarouselProps = ContentDisplayProps & {
    carouselState?: CarouselState;
    allowVideoReorder?: boolean;
    contentFilter: CombinedContentFilter;
  };

  let {
    videos,
    videosCount,
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

  const selectedVideoIds = $derived(
    contentState.selectedVideos.length > 0
      ? new Set((contentState.selectedVideos || []).map((v) => v.id))
      : new Set(),
  );

  // Create drag drop functionality
  const dragDrop = contentState.createDragDrop({
    allowVideoReorder,
    videos,
    videosCount,
    playlist,
    contentFilter,
    supabase,
    onVideosUpdate: (updatedVideos) => {
      // For carousel, we might need to update the parent component
      // This would require videos to be bindable in the parent
      videos = updatedVideos;
    },
  });

  let api = $state<CarouselAPI>();
  let showPreviousButton = $state(false);
  let showNextButton = $state(videos.length > 0);
  let isInitializing = $state(true);
  let userInteracting = $state(false);

  function isVideoIndexInView(videoIndex: number): boolean {
    if (!api) return false;
    const slidesInView = api.slidesInView();
    return slidesInView.includes(videoIndex);
  }

  function getFirstVisibleVideoIndex(): number {
    if (!api) return 0;
    const slidesInView = api.slidesInView();
    return slidesInView.length > 0 ? slidesInView[0] : 0;
  }

  async function scrollToVideoIndex(targetVideoIndex: number) {
    if (!api || targetVideoIndex < 0 || targetVideoIndex >= videos.length)
      return;

    if (isVideoIndexInView(targetVideoIndex)) {
      updateButtonStates();
      isInitializing = false;
      return;
    }

    const slidesInView = api.slidesInView();
    const itemsPerView = slidesInView.length;
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
    }
  }

  async function waitForCarouselReady(
    api: CarouselAPI,
    maxWait = 2000,
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const slidesInView = api.slidesInView();
      if (slidesInView.length > 0) {
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
    if (api && carouselState && carouselState.lastViewedIndex === undefined) {
      const firstVisibleVideoIndex = getFirstVisibleVideoIndex();
      carouselState.lastViewedIndex = firstVisibleVideoIndex;
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

    let classes = `group @4xl:basis-1/5 @sm:basis-1/3 basis-full p-2 rounded-lg
${isSelected ? "scale-105" : ""}`;

    if (isSelected) {
      // Selected state - using !important to override hover
      classes += " !bg-secondary brightness-125";
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      // Use the new drag classes method instead of the old border approach
      classes += ` ${contentState.getVideoDragClasses(index)}`;
    }

    return classes;
  }
</script>

<Carousel.Root
  opts={{
    slidesToScroll: "auto",
    watchDrag: false,
    inViewThreshold: 0.5,
  }}
  class="z-40 overflow-x-clip"
  setApi={(emblaApi) => {
    api = emblaApi;
  }}
>
  <Carousel.Previous
    class={showPreviousButton ? "visible cursor-pointer" : "invisible"}
    onclick={handlePreviousButtonClick}
  />
  <Carousel.Next
    onclick={handleNextButtonClick}
    class={showNextButton ? "visible cursor-pointer " : "invisible"}
  />
  <Carousel.Content class="mx-2">
    {#each videos as video, i (video.id)}
      <Carousel.Item
        class={getItemClasses(video, i)}
        draggable="true"
        ondragstart={(e) => dragDrop.handleDragStart(e, i)}
        ondragover={allowVideoReorder
          ? (e) => dragDrop.handleDragOver(e, i)
          : undefined}
        ondragleave={allowVideoReorder
          ? (e) => dragDrop.handleDragLeave(e)
          : undefined}
        ondrop={allowVideoReorder
          ? (e) => dragDrop.handleDrop(e, i)
          : undefined}
        ondragend={allowVideoReorder ? dragDrop.handleDragEnd : undefined}
        onmouseenter={() =>
          contentState.handleMouseEnter({ video, setSelectedOnHover: true })}
        onmouseleave={() => contentState.handleMouseLeave()}
        onclick={() => {
          if (carouselState) {
            carouselState.lastViewedIndex = i;
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
          {supabase}
          {session}
        />
      </Carousel.Item>
    {/each}
  </Carousel.Content>
</Carousel.Root>
