import type { Video, VideoWithTimestamp } from '$lib/supabase/videos';
import { type DateValue } from '@internationalized/date';
import { goto } from '$app/navigation';
import type { PlaylistVideo } from '$lib/supabase/playlists';
import type { ContentView } from './content';
import { PAGINATION_QUERY_KEY } from '../pagination/pagination';

type SortOption<T extends Video | VideoWithTimestamp | PlaylistVideo> = {
  key: SortKey<T>;
  order: SortOrder;
};

export type ContentFilter<
  T extends Video | VideoWithTimestamp | PlaylistVideo,
> = {
  sort: SortOption<T>;
  startDate?: string;
  endDate?: string;
  type: 'video' | 'playlist' | 'timestamp';
};

export type VideoFilter = ContentFilter<Video> & {
  type: 'video';
};
export type PlaylistVideosFilter = ContentFilter<PlaylistVideo> & {
  type: 'playlist';
};

export type TimestampFilter = ContentFilter<VideoWithTimestamp> & {
  type: 'timestamp';
};

export type CombinedContentFilter =
  | VideoFilter
  | PlaylistVideosFilter
  | TimestampFilter;

interface SortOptionInfo<T extends Video | VideoWithTimestamp | PlaylistVideo> {
  displayName: string;
  tableColumn?: keyof T;
}

export const START_DATE_KEY = 'startDate';
export const END_DATE_KEY = 'endDate';

// There are 2 main data access paths at the moment: either by the videos table or the timestamps tables.
// The filtering options are split to reflect that.
export const videoSortKeys = [
  'searchRelevance',
  'datePublished',
  'title',
] as const;
export const playlistVideosSortKeys = [
  'playlistOrder',
  'datePublished',
  'title',
] as const;
export const timestampSortKeys = [
  'dateTimestamp',
  'datePublished',
  'title',
] as const;

export type SortKey<T extends Video | VideoWithTimestamp | PlaylistVideo> =
  T extends PlaylistVideo
    ? (typeof playlistVideosSortKeys)[number]
    : T extends VideoWithTimestamp
      ? (typeof timestampSortKeys)[number]
      : (typeof videoSortKeys)[number];

export const sortOrder = ['ascending', 'descending'] as const;
export type SortOrder = (typeof sortOrder)[number];

export const SORT_OPTIONS_VIDEO: Record<
  SortKey<Video>,
  SortOptionInfo<Video>
> = {
  datePublished: {
    displayName: 'Date Published',
    tableColumn: 'published_at',
  },
  title: { displayName: 'Title', tableColumn: 'title' },
  searchRelevance: { displayName: 'Search Relevence' },
};

export const SORT_OPTIONS_PLAYLIST_VIDEOS: Record<
  SortKey<PlaylistVideo>,
  SortOptionInfo<any>
> = {
  datePublished: {
    displayName: 'Date Published',
    tableColumn: 'published_at',
  },
  title: { displayName: 'Title', tableColumn: 'title' },
  playlistOrder: {
    displayName: 'Custom',
    tableColumn: 'video_position',
  },
};

export const SORT_OPTIONS_TIMESTAMPS: Record<
  SortKey<VideoWithTimestamp>,
  SortOptionInfo<any>
> = {
  datePublished: {
    displayName: 'Date Published',
    tableColumn: 'published_at',
  },
  title: { displayName: 'Title', tableColumn: 'title' },
  dateTimestamp: {
    displayName: 'Date Watched',
    tableColumn: 'updated_at',
  },
};

/**
 * Returns the first sort option found in query params.
 * If no valid query params are found, returns the second argument.
 */
export function getFilterOptionFromQueryParams({
  searchParams,
  view,
}: {
  searchParams: URLSearchParams;
  view: ContentView;
}) {
  const querySortKey = getSortKeysForView(view).find(
    (key) => !!searchParams.has(key)
  );

  // Define the base filter by view type
  let baseFilter;
  switch (view) {
    case 'continueWatching':
      baseFilter = {
        sort: {
          key: 'dateTimestamp' as SortKey<VideoWithTimestamp>,
          order: 'descending',
        },
        type: 'timestamp',
      } as TimestampFilter;
      break;
    case 'playlist':
      baseFilter = {
        sort: {
          key: 'playlistOrder' as SortKey<PlaylistVideo>,
          order: 'ascending',
        },
        type: 'playlist',
      } as PlaylistVideosFilter;
      break;
    case 'search':
      baseFilter = {
        sort: {
          key: 'searchRelevance' as SortKey<Video>,
          order: 'ascending',
        },
        type: 'video',
      } as VideoFilter;
      break;
    default:
      baseFilter = {
        sort: { key: 'datePublished' as SortKey<Video>, order: 'descending' },
        type: 'video',
      } as VideoFilter;
  }

  // Overwrite defaults with query params if found
  if (querySortKey) {
    const querySortString = searchParams.get(querySortKey);
    const querySortOrder: SortOrder = isSortOrder(querySortString)
      ? querySortString
      : 'descending';

    baseFilter.sort = {
      key: querySortKey as any,
      order: querySortOrder,
    };
  }

  // Playlist ordering (custom) can't be filtered by dates since it's not clear UX what that would do
  if (baseFilter.sort.key !== 'playlistOrder') {
    const startDateQueryParam = searchParams.get(START_DATE_KEY);
    const endDateQueryParam = searchParams.get(END_DATE_KEY);

    if (startDateQueryParam) {
      baseFilter.startDate = startDateQueryParam;
    }

    if (endDateQueryParam) {
      baseFilter.endDate = endDateQueryParam;
    }
  }

  // Return with proper type based on view
  switch (view) {
    case 'continueWatching':
      return baseFilter as TimestampFilter;
    case 'playlist':
      return baseFilter as PlaylistVideosFilter;
    default:
      return baseFilter as VideoFilter;
  }
}

/**
 * Update the current page's query params with the selected filter values
 */
export function updateFilter({
  url,
  contentFilter,
  view,
  startDateValue,
  endDateValue,
}: {
  url: URL;
  contentFilter: CombinedContentFilter;
  view: ContentView;
  startDateValue?: DateValue;
  endDateValue?: DateValue;
}) {
  // Use URL and URLSearchParams to properly handle query parameters
  const newUrl = url;
  const searchParams = newUrl.searchParams;
  const { sort } = contentFilter;

  // Clear ALL possible sort keys for this view type
  getSortKeysForView(view).forEach((key) => {
    searchParams.delete(key);
  });
  // Clear existing parameters we're managing
  searchParams.delete('startDate');
  searchParams.delete('endDate');

  // Remove page query key to reset current page to 1
  searchParams.delete(PAGINATION_QUERY_KEY);

  // Add new parameters as needed
  if (isSortKey(sort.key, view)) {
    searchParams.set(sort.key, sort.order);
  }

  if (startDateValue) {
    searchParams.set('startDate', startDateValue.toString());
  }

  if (endDateValue) {
    searchParams.set('endDate', endDateValue.toString());
  }

  goto(newUrl.toString(), {
    invalidate: ['supabase:db:videos'],
    noScroll: true,
    keepFocus: true,
  });
}

export function isSortKey<T extends Video | VideoWithTimestamp | PlaylistVideo>(
  testKey: unknown,
  view: ContentView
): testKey is SortKey<T> {
  const keys =
    view === 'continueWatching'
      ? timestampSortKeys
      : view === 'playlist'
        ? playlistVideosSortKeys
        : videoSortKeys;

  return (
    !!testKey &&
    typeof testKey === 'string' &&
    (keys as readonly string[]).includes(testKey as string)
  );
}

export function isSortOrder(testOrder: unknown): testOrder is SortOrder {
  return (
    !!testOrder &&
    typeof testOrder === 'string' &&
    sortOrder.includes(testOrder as SortOrder)
  );
}

export function isSortOption<T extends Video | VideoWithTimestamp>(
  sortOption: unknown,
  view: ContentView
): sortOption is SortOption<T> {
  return (
    !!sortOption &&
    typeof sortOption === 'object' &&
    sortOption !== null &&
    'key' in sortOption &&
    'order' in sortOption &&
    isSortKey<T>((sortOption as SortOption<T>).key, view) &&
    isSortOrder((sortOption as SortOption<T>).order)
  );
}

export function getSortKeysForView(view: ContentView) {
  return view === 'continueWatching'
    ? timestampSortKeys
    : view === 'playlist'
      ? playlistVideosSortKeys
      : videoSortKeys;
}

export function getFilterKeysForView(view: ContentView) {
  return [...getSortKeysForView(view), ...[START_DATE_KEY, END_DATE_KEY]];
}

export function getSortDisplayName({
  key,
  view,
}: {
  key: string;
  view: ContentView;
}): string | undefined {
  switch (view) {
    case 'playlist':
      return SORT_OPTIONS_PLAYLIST_VIDEOS[
        key as keyof typeof SORT_OPTIONS_PLAYLIST_VIDEOS
      ]?.displayName;
    case 'continueWatching':
      return SORT_OPTIONS_TIMESTAMPS[
        key as keyof typeof SORT_OPTIONS_TIMESTAMPS
      ]?.displayName;
    default:
      return SORT_OPTIONS_VIDEO[key as keyof typeof SORT_OPTIONS_VIDEO]
        ?.displayName;
  }
}

export function isTimestampFilter(
  filter: CombinedContentFilter
): filter is TimestampFilter {
  return filter.type === 'timestamp';
}

export function isVideoFilter(
  filter: CombinedContentFilter
): filter is VideoFilter {
  return filter.type === 'video';
}

export function isPlaylistVideosFilter(
  filter: CombinedContentFilter
): filter is PlaylistVideosFilter {
  return filter.type === 'playlist';
}
