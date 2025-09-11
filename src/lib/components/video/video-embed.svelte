<script lang="ts">
  const { divId }: { divId: string } = $props();
</script>

<div id={divId} data-testid={`${divId}-test`} class=""></div>
