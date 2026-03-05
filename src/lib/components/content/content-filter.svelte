<script lang="ts">
  import { ArrowDown, ArrowUp, Check, List } from '@lucide/svelte';
  import * as Drawer from '$lib/components/ui/drawer';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import {
    SORT_OPTIONS_VIDEO,
    SORT_OPTIONS_TIMESTAMPS,
    SORT_OPTIONS_PLAYLIST_VIDEOS,
    videoSortKeys,
    timestampSortKeys,
    playlistVideosSortKeys,
    updateFilter,
    type SortKey,
    type SortOrder,
    type CombinedContentFilter,
  } from './content-filter';
  import { page } from '$app/state';
  import type { VideoWithTimestamp, Video } from '$lib/supabase/videos';
  import { parseDate, type DateValue } from '@internationalized/date';
  import {
    isUserPlaylist,
    type Playlist,
    type PlaylistVideo,
  } from '$lib/supabase/playlists';
  import type { ContentView } from './content';
  import { handleUpdatePlaylistSort } from '../playlist/playlist-service';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import Button, { buttonVariants } from '../ui/button/button.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';

  let {
    contentFilter,
    view = 'default',
    playlist,
    supabase,
    session,
  }: {
    contentFilter: CombinedContentFilter;
    view?: ContentView;
    playlist?: Playlist;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const mediaQueryState = getMediaQueryState();
  const sidebarState = getSidebarState();
  let contentFilterDrawerOpen = $state(false);

  const userPlaylists = $derived(sidebarState.playlists);
  const isCurrentPlaylistInSidebar = $derived(
    userPlaylists.some((up) => up.id === playlist?.id)
  );

  // Search routes have a unique case of showing Search Relevence sort option
  const isSearchRoute = $derived(/^\/search\//.test(page.url.pathname));

  // Determine sort keys based on the view type
  const sortKeys = $derived.by(() => {
    switch (view) {
      case 'continueWatching':
        return timestampSortKeys;
      case 'playlist':
        return playlistVideosSortKeys;
      default:
        // Remove searchRelevance from videoSortKeys if on search route
        return isSearchRoute
          ? videoSortKeys
          : videoSortKeys.filter((key) => key !== 'searchRelevance');
    }
  });

  // Get sort option info based on the filter type
  const sortOptionInfo = $derived.by(() => {
    switch (contentFilter.type) {
      case 'timestamp':
        return SORT_OPTIONS_TIMESTAMPS[contentFilter.sort.key];
      case 'playlist':
        return SORT_OPTIONS_PLAYLIST_VIDEOS[contentFilter.sort.key];
      case 'video':
      default:
        return SORT_OPTIONS_VIDEO[contentFilter.sort.key];
    }
  });

  // NOTE: Datepickers removed for now
  // const df = new DateFormatter("en-US", {
  //   dateStyle: "long",
  // });

  let startDateValue = $state<DateValue | undefined>(
    contentFilter.startDate ? parseDate(contentFilter.startDate) : undefined
  );
  let endDateValue = $state<DateValue | undefined>(
    contentFilter.endDate ? parseDate(contentFilter.endDate) : undefined
  );

  // NOTE: Datepickers removed for now
  // const getDaysInPreviousMonth = (year: number, month: number) =>
  //   new Date(year, month - 1, 0).getDate();
  //
  // const { year, month } = today(getLocalTimeZone());

  // const items = [
  //   { value: 0, label: "Today" },
  //   {
  //     value: -7,
  //     label: "Last Week",
  //   },
  //   { value: -getDaysInPreviousMonth(year, month), label: "Last Month" },
  //   { value: -365, label: "Last Year" },
  // ];

  function handleSort(sortKey: string) {
    let sortOrder: SortOrder = 'ascending';

    // If already sorting by this key, toggle the order
    if (contentFilter.sort.key === sortKey) {
      sortOrder =
        contentFilter.sort.order === 'ascending' ? 'descending' : 'ascending';
    }

    // Create the appropriate filter type based on the current view and selected sort key
    let newContentFilter: CombinedContentFilter;

    if (view === 'continueWatching') {
      newContentFilter = {
        type: 'timestamp',
        sort: {
          key: sortKey as SortKey<VideoWithTimestamp>,
          order: sortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
    } else if (view === 'playlist') {
      newContentFilter = {
        type: 'playlist',
        sort: {
          key: sortKey as SortKey<PlaylistVideo>,
          // Only ascending allowed for custom playlist ordering
          order:
            (sortKey as SortKey<PlaylistVideo>) === 'playlistOrder'
              ? 'ascending'
              : sortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
      // Update playlist sort so it can be retrieved next time until changed again
      if (playlist && isUserPlaylist(playlist) && isCurrentPlaylistInSidebar) {
        handleUpdatePlaylistSort({
          playlist,
          sortOrder:
            newContentFilter.sort.key === 'playlistOrder'
              ? 'ascending'
              : sortOrder,
          sortedBy: newContentFilter.sort.key,
          supabase,
          session,
        });
      }
    } else if (view === 'search') {
      newContentFilter = {
        type: 'video',
        sort: {
          key: sortKey as SortKey<Video>,
          order:
            (sortKey as SortKey<Video>) === 'searchRelevance'
              ? 'ascending'
              : sortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
    } else {
      newContentFilter = {
        type: 'video',
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
    updateFilter({
      url: page.url,
      contentFilter,
      startDateValue,
      endDateValue,
      view,
    });
  }

  // NOTE: Datepickers removed for now
  // function handleStartDateChange(value: DateValue | undefined) {
  //   startDateValue = value;
  //   updateFilterQueryParams({
  //     url: page.url,
  //     contentFilter,
  //     startDateValue,
  //     endDateValue,
  //     view,
  //   });
  // }
  //
  // NOTE: Datepickers removed for now
  // function handleEndDateChange(value: DateValue | undefined) {
  //   endDateValue = value;
  //   updateFilterQueryParams({
  //     url: page.url,
  //     contentFilter,
  //     startDateValue,
  //     endDateValue,
  //     view,
  //   });
  // }
</script>

{#if mediaQueryState.canHover}
  <div class="flex flex-col items-center gap-4">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={buttonVariants({
          variant: 'ghost',
          class: 'outline-hiddden flex cursor-pointer items-center gap-1',
        })}
      >
        <span class="mr-1 text-sm tracking-tight"
          >{sortOptionInfo.displayName}</span
        >
        <List size={15} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="outline-hiddden">
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading>Sort by</DropdownMenu.GroupHeading>
          {#each sortKeys as sortKey (sortKey)}
            <DropdownMenu.Item
              class="flex gap-2 @md:justify-between"
              onclick={() => handleSort(sortKey)}
            >
              {#if view === 'continueWatching'}
                {SORT_OPTIONS_TIMESTAMPS[sortKey as SortKey<VideoWithTimestamp>]
                  .displayName}
              {:else if view === 'playlist'}
                {SORT_OPTIONS_PLAYLIST_VIDEOS[sortKey as SortKey<PlaylistVideo>]
                  .displayName}
              {:else}
                {SORT_OPTIONS_VIDEO[sortKey as SortKey<Video>].displayName}
              {/if}

              {#if (contentFilter.sort.key === sortKey && sortKey === 'playlistOrder') || (contentFilter.sort.key === sortKey && sortKey === 'searchRelevance')}
                <Check
                  class={contentFilter.sort.key === sortKey
                    ? 'text-primary'
                    : ''}
                />
              {:else if contentFilter.sort.key === sortKey && contentFilter.sort.order === 'ascending'}
                <ArrowUp
                  class={contentFilter.sort.key === sortKey
                    ? 'text-primary'
                    : ''}
                />
                <span class="sr-only">Ascending</span>
              {:else if contentFilter.sort.key === sortKey && contentFilter.sort.order === 'descending'}
                <ArrowDown
                  class={contentFilter.sort.key === sortKey
                    ? 'text-primary'
                    : ''}
                />
                <span class="sr-only">Descending</span>
              {/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <!-- NOTE: Disabling date filters for now, would like to implement a year selection dropdown before release -->
    <!-- {#if contentFilter.sort.key !== "playlistOrder"} -->
    <!--   <div class="flex flex-col gap-2"> -->
    <!--     <DatePicker -->
    <!--       label="Start Date" -->
    <!--       bind:value={startDateValue} -->
    <!--       isOpen={false} -->
    <!--       {items} -->
    <!--       dateFormatter={df} -->
    <!--       onChange={handleStartDateChange} -->
    <!--       onClear={() => handleStartDateChange(undefined)} -->
    <!--     /> -->
    <!--     <DatePicker -->
    <!--       label="End Date" -->
    <!--       bind:value={endDateValue} -->
    <!--       isOpen={false} -->
    <!--       {items} -->
    <!--       dateFormatter={df} -->
    <!--       onChange={handleEndDateChange} -->
    <!--       onClear={() => handleEndDateChange(undefined)} -->
    <!--     /> -->
    <!--   </div> -->
    <!-- {/if} -->
  </div>
{:else}
  <Drawer.Root bind:open={contentFilterDrawerOpen}>
    <Drawer.Trigger
      class="hover:text-primary outline-hiddden flex cursor-pointer items-center gap-1"
    >
      <span class="text-sm">{sortOptionInfo.displayName}</span>
      <List size={20} />
    </Drawer.Trigger>
    <Drawer.Content class="outline-hiddden">
      <Drawer.Header class="m-2 text-left">Sort by</Drawer.Header>
      {#each sortKeys as sortKey (sortKey)}
        <Button
          class="drawer-button flex items-center justify-between"
          variant="ghost"
          onclick={() => {
            handleSort(sortKey);
            contentFilterDrawerOpen = false;
          }}
        >
          <span>
            {#if view === 'continueWatching'}
              {SORT_OPTIONS_TIMESTAMPS[sortKey as SortKey<VideoWithTimestamp>]
                .displayName}
            {:else if view === 'playlist'}
              {SORT_OPTIONS_PLAYLIST_VIDEOS[sortKey as SortKey<PlaylistVideo>]
                .displayName}
            {:else}
              {SORT_OPTIONS_VIDEO[sortKey as SortKey<Video>].displayName}
            {/if}
          </span>

          <!-- Always reserve space for an icon, but only show when active -->
          <div class="flex h-4 w-4 flex-shrink-0 items-center justify-center">
            {#if contentFilter.sort.key === sortKey && sortKey === 'playlistOrder'}
              <Check size={16} class="text-primary" />
            {:else if contentFilter.sort.key === sortKey && contentFilter.sort.order === 'ascending'}
              <ArrowUp size={16} class="text-primary" />
            {:else if contentFilter.sort.key === sortKey && contentFilter.sort.order === 'descending'}
              <ArrowDown size={16} class="text-primary" />
            {/if}
            <!-- Empty div when no icon - this maintains consistent spacing -->
          </div>
        </Button>
      {/each}
      <div class="mt-auto p-2">
        <Drawer.Footer class="drawer-footer">
          <Drawer.Close
            class={buttonVariants({
              class: 'drawer-button-footer',
              variant: 'outline',
            })}
            >Close
          </Drawer.Close>
        </Drawer.Footer>
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
