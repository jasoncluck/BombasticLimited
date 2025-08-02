<script lang="ts">
  import { LayoutMain } from "$lib/components/layout";

  let { data, children } = $props();

  // Re-export snapshot from LayoutMain
  // export { snapshot } from "$lib/components/layout/layout-main.svelte";
</script>

<LayoutMain {data}>
  {@render children()}
</LayoutMain>
