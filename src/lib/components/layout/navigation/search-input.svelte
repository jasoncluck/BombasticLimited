<script lang="ts">
  import Input from '$lib/components/ui/input/input.svelte';
  import Loader from '$lib/components/loader.svelte';
  import type { NavigationState } from '$lib/state/navigation.svelte.js';

  let {
    navigationState,
    class: className = 'sm:w-72 w-52',
  }: {
    navigationState: NavigationState;
    class?: string;
  } = $props();
</script>

<div class="relative flex items-center">
  <Input
    type="search"
    data-testid="search-input"
    oninput={(e) => navigationState.handleSearch(e)}
    placeholder="Search"
    class={className}
    bind:value={navigationState.searchQuery}
  />
  <Loader message="" size="sm" visible={navigationState.isSearching} />
</div>
