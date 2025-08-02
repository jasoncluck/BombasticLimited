<script lang="ts">
  let {
    isNavigatingToContent,
  }: {
    isNavigatingToContent: boolean;
  } = $props();
</script>

<!-- Navigation Loading Overlay -->
<div
  class="absolute inset-0 z-[10000] bg-background-lighter flex items-center justify-center"
  class:opacity-100={isNavigatingToContent}
  class:opacity-0={!isNavigatingToContent}
  class:pointer-events-none={!isNavigatingToContent}
  class:scale-100={isNavigatingToContent}
  class:scale-95={!isNavigatingToContent}
>
  <!-- Uncomment if you want to show a loader during navigation -->
  <!-- <div class="flex flex-col items-center space-y-2"> -->
  <!--   <Loader size="lg" message="" /> -->
  <!--   <p class="text-sm text-muted-foreground">Loading...</p> -->
  <!-- </div> -->
</div>
