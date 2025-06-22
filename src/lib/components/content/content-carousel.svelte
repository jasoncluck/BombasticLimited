<script lang="ts">
  import * as Carousel from "$lib/components/ui/carousel";
  import ContentCard from "./content-card.svelte";
  import type { CarouselState, ContentDisplayProps } from "./content";
  import type { CarouselAPI } from "../ui/carousel/context";
  import { onDestroy } from "svelte";

  let {
    videos,
    handleDragStart,
    isContinueVideos,
    playlists,
    playlist,
    playlistContentFilter,
    carouselState = $bindable(),
    invalidateOnVideoChange,
    supabase,
    session,
  }: { carouselState?: CarouselState } & ContentDisplayProps = $props();

  let api = $state<CarouselAPI>();
  let showPreviousButton = $state(false);
  let showNextButton = $state(videos.length > 0);

  // Function to check if target index is in the currently visible range
  function isIndexInView(targetIndex: number): boolean {
    if (!api) return false;

    const slidesInView = api.slidesInView();
    console.log(slidesInView);
    return slidesInView.includes(targetIndex);
  }

  // Function to scroll to target index incrementally
  async function scrollToIndex(targetIndex: number) {
    if (!api || targetIndex < 0 || targetIndex >= videos.length) return;

    console.log("Scrolling to target index:", targetIndex);

    // If target is already in view, we're done
    if (isIndexInView(targetIndex)) {
      console.log("Target index already in view");
      updateButtonStates();
      return;
    }

    const currentSnap = api.selectedScrollSnap();

    // Determine if we need to scroll forward or backward
    if (targetIndex > currentSnap) {
      console.log(targetIndex);
      console.log(currentSnap);
      // Scroll forward until target is in view
      while (!isIndexInView(targetIndex) && api.canScrollNext()) {
        api.scrollNext();
      }
    } else {
      // Scroll backward until target is in view
      while (!isIndexInView(targetIndex) && api.canScrollPrev()) {
        api.scrollPrev();
      }
    }

    updateButtonStates();
    console.log(
      "Finished scrolling. Target index in view:",
      isIndexInView(targetIndex),
    );
  }

  function updateButtonStates() {
    if (api) {
      showPreviousButton = api.canScrollPrev();
      showNextButton = api.canScrollNext();
    }
  }

  $effect(() => {
    if (
      api &&
      carouselState?.lastViewedIndex !== undefined &&
      carouselState.lastViewedIndex > -1
    ) {
      console.log(
        "Setting carousel to last viewed index:",
        carouselState.lastViewedIndex,
      );
      scrollToIndex(carouselState.lastViewedIndex);
    }
  });

  onDestroy(() => {
    if (
      api?.selectedScrollSnap() !== undefined &&
      api?.selectedScrollSnap() > -1
    ) {
      const currentIndex = api.selectedScrollSnap();
      console.log("Saving last viewed index on destroy:", currentIndex);

      if (carouselState) {
        carouselState.lastViewedIndex = currentIndex;
      }
    }
  });

  function handlePreviousButtonClick() {
    if (api) {
      api.scrollPrev();
      updateButtonStates();

      // Update the carousel state with new position
      if (carouselState) {
        carouselState.lastViewedIndex = api.selectedScrollSnap();
      }
    }
  }

  function handleNextButtonClick() {
    if (api) {
      api.scrollNext();
      updateButtonStates();

      // Update the carousel state with new position
      if (carouselState) {
        carouselState.lastViewedIndex = api.selectedScrollSnap();
      }
    }
  }
</script>

<Carousel.Root
  opts={{
    slidesToScroll: "auto",
    watchDrag: false,
  }}
  class="hover:z-20 overflow-x-clip"
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
  <Carousel.Content>
    {#each videos as video, i (video.id)}
      <Carousel.Item
        class="group @4xl:basis-1/5 @sm:basis-1/3 
          basis-full duration-300 transform px-3 transition-transform"
        draggable="true"
        ondragstart={(e) => handleDragStart(e, i)}
      >
        <ContentCard
          {video}
          {videos}
          {playlist}
          {playlistContentFilter}
          {playlists}
          {invalidateOnVideoChange}
          {isContinueVideos}
          {supabase}
          {session}
        />
      </Carousel.Item>
    {/each}
  </Carousel.Content>
</Carousel.Root>
