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
    supabase,
    session,
  }: { carouselState?: CarouselState } & ContentDisplayProps = $props();

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

    // Calculate the "snap" index that should show our target
    const slidesInView = api.slidesInView();
    const itemsPerView = slidesInView.length;

    // Calculate which "snap" (page) should contain our target
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
      // Wait for carousel to be ready before scrolling
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
</script>

<Carousel.Root
  opts={{
    slidesToScroll: "auto",
    watchDrag: false,
    inViewThreshold: 0.5,
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
        onclick={() => {
          if (carouselState) {
            carouselState.lastViewedIndex = i;
          }
        }}
      >
        <ContentCard
          {video}
          {videos}
          {playlist}
          {playlistContentFilter}
          {playlists}
          {isContinueVideos}
          {supabase}
          {session}
        />
      </Carousel.Item>
    {/each}
  </Carousel.Content>
</Carousel.Root>
