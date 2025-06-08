<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source.js";
  import Content from "$lib/components/content/content.svelte";
  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { type CarouselsState } from "$lib/components/content/content.js";
  import type { Snapshot } from "@sveltejs/kit";
  import { getCroppedPlaylistImageUrl } from "$lib/components/playlist/playlist-service.js";
  import { onMount } from "svelte";
  import { ListVideo } from "@lucide/svelte";

  let { data } = $props();
  let {
    supabase,
    session,
    searchString,
    sourceVideos,
    playlistSearchResults,
    playlists,
    contentFilter,
  } = $derived(data);

  let playlistImagesLoaded = $state(false);
  let playlistImages = $state<Record<string, string | undefined>>();

  export const snapshot: Snapshot<CarouselsState> = {
    capture: () => carouselsState,
    restore: async (restored) => (carouselsState = restored),
  };

  const isEmptyResults = $derived(
    !(sourceVideos && Object.values(sourceVideos).some((s) => s.length > 0)),
  );

  let carouselsState = $state<CarouselsState>(
    Object.fromEntries(
      SOURCES.map((key) => [key, { startIndex: 0 }]),
    ) as CarouselsState,
  );
  onMount(() => {
    const playlistImageUrls = playlistSearchResults.map(async (p) => {
      const imageUrl = await getCroppedPlaylistImageUrl({
        imageProperties: p.image_properties,
        thumbnailMaxResUrl: p.thumbnail_maxres_url,
        thumbnailUrl: p.thumbnail_url,
      });
      return { id: p.id, imageUrl };
    });
    Promise.all(playlistImageUrls)
      .then((results) => {
        const imagesMap: Record<string, string | undefined> = {};
        results.forEach(({ id, imageUrl }) => {
          imagesMap[id] = imageUrl;
        });
        playlistImagesLoaded = true;
        playlistImages = imagesMap;
      })
      .catch((error) => {
        console.error("Error loading playlist images:", error);
        playlistImagesLoaded = true; // Still mark as loaded so UI can render with fallbacks
      });
  });
</script>

<div class="flex flex-col gap-2">
  <h1 class="header-primary">
    <div class="flex items-center">Results</div>
  </h1>

  {#if playlistSearchResults.length > 0}
    <a class="header-link" href={`/search/${searchString}/playlists`}
      >Playlists</a
    >

    <div class="w-[90%] grid grid-cols-3 gap-4">
      {#each playlistSearchResults as playlist (playlist.id)}
        <a
          class="grid grid-cols-[4rem_1fr] p-3 gap-4 items-center hover:bg-secondary
      transform ease-out transition-colors duration-150 cursor-pointer rounded"
          href={`/playlist/${playlist.short_id}`}
        >
          {#if playlistImagesLoaded && playlistImages && playlistImages[playlist.id]}
            <img
              src={playlistImages[playlist.id]}
              alt={playlist.name}
              class="w-full h-full max-w-16 max-h-16 object-cover rounded justify-self-center"
            />
          {:else}
            <div
              class="h-12 w-12 flex items-center justify-center justify-self-center"
            >
              <ListVideo class="!h-12 !w-12" />
            </div>
          {/if}

          <div class="min-w-0">
            <p class="text-sm font-medium truncate mb-1">
              {playlist.name}
            </p>
            <p class="text-xs text-muted-foreground line-clamp-3">
              {playlist.description}
            </p>
          </div>
        </a>
      {/each}
    </div>
  {/if}

  {#each SOURCES as source (source)}
    {#if sourceVideos[source].length > 0}
      <div class="flex flex-col bg-background-lighter gap-4">
        <a href={`${page.url}/${source}`} class="header-link">
          {SOURCE_INFO[source].displayName}
        </a>
        <Content
          contentDisplay={userPreferences.contentDisplay}
          videos={sourceVideos[source]}
          bind:carouselState={carouselsState[source]}
          {playlists}
          {contentFilter}
          {session}
          {supabase}
        />
      </div>
    {/if}
  {/each}
  {#if isEmptyResults}
    <div class="w-full flex justify-center">
      <h1 class="text-xl">No results found</h1>
    </div>
  {/if}
</div>
