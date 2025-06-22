<script lang="ts">
  import { ArrowDown, ArrowUp, List } from "@lucide/svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import {
    SORT_OPTIONS_VIDEO,
    SORT_OPTIONS_TIMESTAMPS,
    SORT_OPTIONS_PLAYLIST_VIDEOS,
    videoSortKeys,
    timestampSortKeys,
    playlistVideosSortKeys,
    updateFilterQueryParams,
    type SortKey,
    type SortOrder,
    type CombinedContentFilter,
  } from "./content-filter";
  import { page } from "$app/state";
  import type { VideoTimestamp, Video } from "$lib/supabase/videos";
  import {
    DateFormatter,
    getLocalTimeZone,
    parseDate,
    today,
    type DateValue,
  } from "@internationalized/date";
  import DatePicker from "../date-picker.svelte";
  import type { PlaylistVideo } from "$lib/supabase/playlists";
  import type { ContentView } from "./content";

  let {
    contentFilter,
    view = "default",
  }: {
    contentFilter: CombinedContentFilter;
    view?: ContentView;
  } = $props();

  // Determine sort keys based on the view type
  const sortKeys = $derived.by(() => {
    switch (view) {
      case "continueWatching":
        return timestampSortKeys;
      case "playlist":
        return playlistVideosSortKeys;
      default:
        return videoSortKeys;
    }
  });

  // Get sort option info based on the filter type
  const sortOptionInfo = $derived.by(() => {
    switch (contentFilter.type) {
      case "timestamp":
        return SORT_OPTIONS_TIMESTAMPS[contentFilter.sort.key];
      case "playlist":
        return SORT_OPTIONS_PLAYLIST_VIDEOS[contentFilter.sort.key];
      case "video":
      default:
        return SORT_OPTIONS_VIDEO[contentFilter.sort.key];
    }
  });

  const df = new DateFormatter("en-US", {
    dateStyle: "long",
  });

  let startDateValue = $state<DateValue | undefined>(
    contentFilter.startDate ? parseDate(contentFilter.startDate) : undefined,
  );
  let endDateValue = $state<DateValue | undefined>(
    contentFilter.endDate ? parseDate(contentFilter.endDate) : undefined,
  );

  const getDaysInPreviousMonth = (year: number, month: number) =>
    new Date(year, month - 1, 0).getDate();

  const { year, month } = today(getLocalTimeZone());

  const items = [
    { value: 0, label: "Today" },
    {
      value: -7,
      label: "Last Week",
    },
    { value: -getDaysInPreviousMonth(year, month), label: "Last Month" },
    { value: -365, label: "Last Year" },
  ];

  function handleSort(sortKey: string) {
    let sortOrder: SortOrder = "ascending";

    // If already sorting by this key, toggle the order
    if (contentFilter.sort.key === sortKey) {
      sortOrder =
        contentFilter.sort.order === "ascending" ? "descending" : "ascending";
    }

    // Create the appropriate filter type based on the current view and selected sort key
    let newContentFilter: CombinedContentFilter;

    if (view === "continueWatching") {
      newContentFilter = {
        type: "timestamp",
        sort: {
          key: sortKey as SortKey<VideoTimestamp>,
          order: sortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
    } else if (view === "playlist") {
      newContentFilter = {
        type: "playlist",
        sort: {
          key: sortKey as SortKey<PlaylistVideo>,
          order: sortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
    } else {
      newContentFilter = {
        type: "video",
        sort: {
          key: sortKey as SortKey<Video>,
          order: sortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
    }

    // Update the contentFilter
    contentFilter = newContentFilter;

    // Redirect to the same page with the updated query params
    updateFilterQueryParams({
      url: page.url,
      contentFilter,
      startDateValue,
      endDateValue,
      view,
    });
  }

  function handleStartDateChange(value: DateValue | undefined) {
    startDateValue = value;
    updateFilterQueryParams({
      url: page.url,
      contentFilter,
      startDateValue,
      endDateValue,
      view,
    });
  }

  function handleEndDateChange(value: DateValue | undefined) {
    endDateValue = value;
    updateFilterQueryParams({
      url: page.url,
      contentFilter,
      startDateValue,
      endDateValue,
      view,
    });
  }
</script>

<div class="flex flex-col items-start gap-4">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="cursor-pointer hover:text-primary flex items-center gap-1"
    >
      <span class="text-xs">{sortOptionInfo.displayName}</span>
      <List size={20} />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading>Sort by</DropdownMenu.GroupHeading>
        {#each sortKeys as sortKey (sortKey)}
          <DropdownMenu.Item
            class="flex gap-2 @md:justify-between"
            onclick={() => handleSort(sortKey)}
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

            {#if contentFilter.sort.key === sortKey && contentFilter.sort.order === "ascending"}
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
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
  {#if contentFilter.sort.key !== "playlistOrder"}
    <div class="flex flex-col gap-2">
      <DatePicker
        label="Start Date"
        bind:value={startDateValue}
        isOpen={false}
        {items}
        dateFormatter={df}
        onChange={handleStartDateChange}
        onClear={() => handleStartDateChange(undefined)}
      />
      <DatePicker
        label="End Date"
        bind:value={endDateValue}
        isOpen={false}
        {items}
        dateFormatter={df}
        onChange={handleEndDateChange}
        onClear={() => handleEndDateChange(undefined)}
      />
    </div>
  {/if}
</div>
