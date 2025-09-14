<script lang="ts">
  import Input from '$lib/components/ui/input/input.svelte';
  import { getNavigationState } from '$lib/state/navigation.svelte';
  import { onMount } from 'svelte';
  import debounce from 'debounce';
  import { goto, preloadData } from '$app/navigation';

  let {
    class: className = 'md:w-60 w-36 sm:w-44',
    initialValue = '',
  }: {
    class?: string;
    initialValue?: string;
  } = $props();

  const navigationState = getNavigationState();

  // Local search input state - isolated from navigation state
  let searchInputValue = $state(initialValue);
  let isLocallyTyping = $state(false);
  let lastInputTime = $state(0);
  let currentTimestamp = $state(0);
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentDebouncedSearch: ReturnType<typeof debounce> | null = null;
  let preloadTimeout: ReturnType<typeof setTimeout> | null = null;

  // Sync initial value from navigation state on mount
  onMount(() => {
    if (navigationState.searchQuery && !searchInputValue) {
      searchInputValue = navigationState.searchQuery;
    }
  });

  // Watch for external changes (like from URL) but only when not typing
  $effect(() => {
    if (!isLocallyTyping && navigationState.searchQuery !== searchInputValue) {
      const timeSinceLastInput = Date.now() - lastInputTime;

      // Only sync if enough time has passed since last user input
      if (timeSinceLastInput > 2000) {
        searchInputValue = navigationState.searchQuery;
      }
    }
  });

  function handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const timestamp = Date.now();

    // Update local state
    searchInputValue = value;
    lastInputTime = timestamp;
    currentTimestamp = timestamp;
    isLocallyTyping = true;

    // Clear existing typing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Set typing to false after user stops typing
    typingTimeout = setTimeout(() => {
      isLocallyTyping = false;
    }, 500);

    // Cancel any existing debounced search
    if (currentDebouncedSearch) {
      currentDebouncedSearch.clear();
    }

    // Cancel any existing preload
    if (preloadTimeout) {
      clearTimeout(preloadTimeout);
      preloadTimeout = null;
    }

    const trimmedValue = value.trim();

    // Set up preloading for valid search queries
    if (trimmedValue.length >= 2) {
      preloadTimeout = setTimeout(() => {
        if (searchInputValue.trim() === trimmedValue) {
          const searchUrl = `/search/${encodeURIComponent(trimmedValue)}`;
          preloadData(searchUrl);
        }
      }, navigationState.config.preloadDebounceMs);
    }

    // Debounce the actual search navigation
    currentDebouncedSearch = debounce(() => {
      if (
        searchInputValue.trim() === trimmedValue &&
        currentTimestamp === timestamp
      ) {
        performSearch(trimmedValue, timestamp);
      }
    }, navigationState.config.searchDebounceMs);

    currentDebouncedSearch();
  }

  async function performSearch(searchValue: string, searchTimestamp: number) {
    // Double-check that this search is still current
    if (currentTimestamp !== searchTimestamp) {
      return;
    }

    // Double-check that the input value hasn't changed
    if (searchInputValue.trim() !== searchValue) {
      return;
    }

    try {
      navigationState.isSearching = true;

      if (searchValue === '') {
        // Small delay to ensure user hasn't started typing again
        await new Promise((resolve) => setTimeout(resolve, 10));

        if (
          searchInputValue.trim() !== '' ||
          currentTimestamp !== searchTimestamp
        ) {
          return;
        }

        await goto('/', {
          keepFocus: true,
          replaceState: false,
        });
      } else if (searchValue.length >= 2) {
        // Check again before navigation
        if (
          searchInputValue.trim() !== searchValue ||
          currentTimestamp !== searchTimestamp
        ) {
          return;
        }

        await goto(`/search/${encodeURIComponent(searchValue)}`, {
          keepFocus: true,
          replaceState: true,
        });
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Search navigation error:', error);
      }
    } finally {
      // Only clear searching state if this is still the current search
      if (currentTimestamp === searchTimestamp) {
        navigationState.isSearching = false;
      }
    }
  }

  function clearSearch() {
    searchInputValue = '';
    lastInputTime = 0;
    currentTimestamp = 0;
    isLocallyTyping = false;

    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }

    if (currentDebouncedSearch) {
      currentDebouncedSearch.clear();
      currentDebouncedSearch = null;
    }

    if (preloadTimeout) {
      clearTimeout(preloadTimeout);
      preloadTimeout = null;
    }
  }

  // Expose clear method for external use
  export function clear() {
    clearSearch();
  }

  // Expose set value method for external use
  export function setValue(value: string) {
    searchInputValue = value;
  }

  // Cleanup on destroy
  function cleanup() {
    clearSearch();
  }

  onMount(() => {
    return cleanup;
  });
</script>

<div class="relative flex">
  <Input
    type="search"
    data-testid="search-input"
    oninput={handleInputChange}
    placeholder="Search"
    class={className}
    bind:value={searchInputValue}
  />
</div>
