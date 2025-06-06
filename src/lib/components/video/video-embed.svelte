<script lang="ts">
  const { divId }: { divId: string } = $props();
</script>

<div class="flex justify-center w-full h-full">
  <div class="w-full h-full max-w-[1400px]">
    <div class="relative pb-[56.25%] h-0">
      <div
        id={divId}
        data-testid={`${divId}-test`}
        class="absolute top-0 left-0 w-full h-full"
      ></div>
    </div>
  </div>
</div>
