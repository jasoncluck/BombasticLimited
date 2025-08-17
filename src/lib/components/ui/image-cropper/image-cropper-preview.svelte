<!--
	Installed from @ieedan/shadcn-svelte-extras
-->

<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import type { ImageCropperPreviewProps } from './types';
  import { useImageCropperPreview } from './image-cropper.svelte.js';
  import { cn } from '$lib/utils/utils';

  let { child, class: className }: ImageCropperPreviewProps = $props();

  const previewState = useImageCropperPreview();
</script>

{#if child}
  {@render child({ src: previewState.rootState.src })}
{:else}
  <!-- Use regular img tag that respects the container size instead of fixed Avatar size -->
  <!-- svelte-ignore a11y_img_redundant_alt -->
  <img
    src={previewState.rootState.src}
    class={cn(
      'ring-accent ring-offset-background h-full w-full rounded object-cover ring-2 ring-offset-2',
      className
    )}
    alt="Image preview"
  />
{/if}
