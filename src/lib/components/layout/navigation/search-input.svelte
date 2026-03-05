<script lang="ts">
  import Input from '$lib/components/ui/input/input.svelte';
  import { getNavigationState } from '$lib/state/navigation.svelte';

  let {
    class: className = 'md:w-60 w-36 sm:w-44',
  }: {
    class?: string;
  } = $props();

  const navigationState = getNavigationState();
</script>

<div class="relative flex">
  <Input
    type="search"
    data-testid="search-input"
    oninput={(e) => navigationState.handleSearch(e)}
    placeholder="Search"
    class={className}
    bind:value={navigationState.searchInputValue}
  />
</div>
