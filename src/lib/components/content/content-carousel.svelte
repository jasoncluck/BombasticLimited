<script lang="ts">
  import * as Carousel from "$lib/components/ui/carousel";
  import ContentCard from "./content-card.svelte";
  import type { ContentDisplayProps } from "./content";
  import type { CarouselAPI } from "../ui/carousel/context";
  import { onDestroy } from "svelte";

  let {
    videos,
    handleDragStart,
    isContinueVideos,
    playlists,
    playlist,
    playlistContentFilter,
    startIndex = $bindable(),
    invalidateOnVideoChange,
    supabase,
    session,
  }: { startIndex: number } & ContentDisplayProps = $props();
  let api = $state<CarouselAPI>();
  let showPreviousButton = $state(false);
  let showNextButton = $state(videos.length > 0);

  $effect(() => {
    if (api && startIndex) {
      api.scrollTo(startIndex);
      showPreviousButton = api.canScrollPrev();
      showNextButton = api.canScrollNext();
    }
  });

  onDestroy(() => {
    if (api?.selectedScrollSnap()) {
      startIndex = api.selectedScrollSnap();
    }
  });

  function handlePreviousButtonClick() {
    if (api) {
      api.scrollPrev();
      showPreviousButton = api.canScrollPrev();
      showNextButton = api.canScrollNext();
    }
  }

  function handleNextButtonClick() {
    if (api) {
      api.scrollNext();
      showPreviousButton = api.canScrollPrev();
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
