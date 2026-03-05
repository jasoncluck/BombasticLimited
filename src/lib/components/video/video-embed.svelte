<script lang="ts">
  const { divId }: { divId: string } = $props();
</script>

<div
  id={divId}
  data-testid={`${divId}-test`}
  class="absolute top-0 left-0 h-full w-full"
></div>
