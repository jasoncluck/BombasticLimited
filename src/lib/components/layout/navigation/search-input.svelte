<script lang="ts">
  import Input from '$lib/components/ui/input/input.svelte';
  import Loader from '$lib/components/loader.svelte';
  import type { LayoutState } from '$lib/state/layout.svelte.js';

  let {
    layoutState,
    class: className = 'sm:w-72 w-52',
  }: {
    layoutState: LayoutState;
    class?: string;
  } = $props();
</script>

<div class="relative flex items-center">
  <Input
    type="search"
    data-testid="search-input"
    oninput={(e) => layoutState.handleSearch(e)}
    placeholder="Search"
    class={className}
    bind:value={layoutState.searchQuery}
  />
  <Loader message="" size="sm" visible={layoutState.isSearching} />
</div>
