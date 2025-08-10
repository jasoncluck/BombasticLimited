<script lang="ts">
  let {
    isNavigatingToContent,
  }: {
    isNavigatingToContent: boolean;
  } = $props();
</script>

<!-- Navigation Loading Overlay -->
<div
  class="absolute inset-0 z-[10000] flex items-center justify-center bg-transparent"
  class:opacity-100={isNavigatingToContent}
  class:opacity-0={!isNavigatingToContent}
  class:pointer-events-none={!isNavigatingToContent}
  class:scale-100={isNavigatingToContent}
  class:scale-95={!isNavigatingToContent}
></div>
