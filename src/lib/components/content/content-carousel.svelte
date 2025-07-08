<script lang="ts">
  import * as Carousel from "$lib/components/ui/carousel";
  import ContentCard from "./content-card.svelte";
  import {
    handleContentNavigation,
    type CarouselState,
    type ContentDisplayProps,
  } from "./content";
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
    sectionId,
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
    contentState.selectedVideosBySection[sectionId] ?? [],
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

  const selectedVideoIds = $derived(
    selectedVideos.length > 0
      ? new Set(selectedVideos.map((v) => v.id))
      : new Set(),
  );

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
    const isHovered = hoveredVideo?.id === video.id;

    let classes = `group @4xl:basis-1/5 @sm:basis-1/3 basis-full p-2 rounded-md `;

    // Apply the same visual state for both hover and selected
    if (isSelected || isHovered) {
      classes += " scale-105 !bg-secondary brightness-125";
    } else {
      // Add hover effect for non-selected/non-hovered items
      classes += "hover:bg-secondary";
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      classes += ` ${contentState.getVideoDragClasses(index)}`;
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
  onmouseleave={handleCarouselMouseLeave}
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
        ondragstart={(e) => dragDrop.handleDragStart(e, i, sectionId)}
        ondragover={allowVideoReorder
          ? (e) => dragDrop.handleDragOver(e, i)
          : undefined}
        ondragleave={allowVideoReorder
          ? (e) => dragDrop.handleDragLeave(e)
          : undefined}
        ondrop={allowVideoReorder
          ? (e) => dragDrop.handleDrop(e, i, sectionId)
          : undefined}
        ondragend={allowVideoReorder ? dragDrop.handleDragEnd : undefined}
        onmouseenter={() =>
          contentState.handleMouseEnter({
            video,
            sectionId,
          })}
        onmouseleave={() =>
          contentState.handleMouseLeave({
            sectionId,
          })}
        onclick={(e) => {
          e.preventDefault();

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
          console.log("in on context menu");

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
