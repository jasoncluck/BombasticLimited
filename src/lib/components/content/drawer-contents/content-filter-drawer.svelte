<script lang="ts">
  import Button, {
    buttonVariants,
  } from "$lib/components/ui/button/button.svelte";
  import * as Drawer from "$lib/components/ui/drawer";
  import type { DrawerState } from "$lib/state/drawer.svelte";
  import {
    SORT_OPTIONS_PLAYLIST_VIDEOS,
    SORT_OPTIONS_TIMESTAMPS,
    SORT_OPTIONS_VIDEO,
    type CombinedContentFilter,
    type SortKey,
  } from "../content-filter";
  import type { Video, VideoTimestamp } from "$lib/supabase/videos";
  import type { PlaylistVideo } from "$lib/supabase/playlists";
  import type { ContentView } from "../content";
  import { ArrowDown, ArrowUp, Check } from "@lucide/svelte";

  let {
    sortKeys,
    handleSort,
    contentFilter,
    view,
    drawerState,
  }: {
    sortKeys: Readonly<
      SortKey<Video>[] | SortKey<VideoTimestamp>[] | SortKey<PlaylistVideo>[]
    >;
    handleSort: (sortKey: string) => void;
    onPlaylistEdit?: () => void;
    view?: ContentView;
    contentFilter: CombinedContentFilter;
    drawerState: DrawerState;
  } = $props();

  function closeDrawer() {
    drawerState.close();
  }
</script>

<Drawer.Content class="outline-none">
  <div class="flex flex-col">
    <Drawer.Header class="mb-4">Sort by</Drawer.Header>
    {#each sortKeys as sortKey (sortKey)}
      <Button
        class="drawer-button"
        variant="ghost"
        onclick={() => {
          handleSort(sortKey);
          closeDrawer();
        }}
      >
        {#if view === "continueWatching"}
          {SORT_OPTIONS_TIMESTAMPS[sortKey as SortKey<VideoTimestamp>]
            .displayName}
        {:else if view === "playlist"}
          {SORT_OPTIONS_PLAYLIST_VIDEOS[sortKey as SortKey<PlaylistVideo>]
            .displayName}
        {:else}
          {SORT_OPTIONS_VIDEO[sortKey as SortKey<Video>].displayName}
        {/if}

        {#if contentFilter.sort.key === sortKey && sortKey === "playlistOrder"}
          <Check
            class={contentFilter.sort.key === sortKey ? "text-primary" : ""}
          />
        {:else if contentFilter.sort.key === sortKey && contentFilter.sort.order === "ascending"}
          <ArrowUp
            class={contentFilter.sort.key === sortKey ? "text-primary" : ""}
          />
          <span class="sr-only">Ascending</span>
        {:else if contentFilter.sort.key === sortKey && contentFilter.sort.order === "descending"}
          <ArrowDown
            class={contentFilter.sort.key === sortKey ? "text-primary" : ""}
          />
          <span class="sr-only">Descending</span>
        {/if}
      </Button>
    {/each}
    <div class="p-2 mt-auto">
      <button
        onclick={closeDrawer}
        class={buttonVariants({
          class: "drawer-button-footer w-full",
          variant: "outline",
        })}
      >
        Close
      </button>
    </div>
  </div>
</Drawer.Content>
