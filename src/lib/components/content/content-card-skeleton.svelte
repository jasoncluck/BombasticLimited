<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div class="group mb-6 w-full transform cursor-pointer will-change-transform">
  <div role="button" tabindex="0" class="cursor-pointer text-left">
    <div class="relative">
      <!-- Image skeleton with 16:9 aspect ratio -->
      <Skeleton class="aspect-[16/9] h-auto w-full" />

      <!-- Dropdown button skeleton -->
      <div class="absolute top-0.5 right-0.5">
        <Skeleton class="h-6 w-6 rounded" />
      </div>
    </div>

    <!-- Title skeleton -->
    <div class="p-2">
      <Skeleton class="mb-1 h-4 w-3/4" />
      <Skeleton class="h-4 w-1/2" />
    </div>

    <!-- Playlist info skeleton (optional, shown sometimes) -->
    <div class="mt-1 mb-3 flex items-center gap-2 px-2">
      <Skeleton class="h-4 w-4 shrink-0" />
      <div class="flex w-full flex-col justify-center gap-2">
        <Skeleton class="h-3 w-2/3" />
        <Skeleton class="h-3 w-1/3" />
      </div>
    </div>

    <!-- Date skeleton -->
    <div class="px-2">
      <Skeleton class="h-3 w-24" />
    </div>
  </div>
</div>
