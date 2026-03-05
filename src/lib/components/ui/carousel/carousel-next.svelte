<script lang="ts">
  import type { WithoutChildren } from 'bits-ui';
  import { getEmblaContext } from './context.js';
  import { cn } from '$lib/utils.js';
  import { Button, type Props } from '$lib/components/ui/button/index.js';
  import { ArrowRightIcon } from '@lucide/svelte';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'outline',
    size = 'icon',
    ...restProps
  }: WithoutChildren<Props> = $props();

  const emblaCtx = getEmblaContext('<Carousel.Next/>');
</script>

<Button
  data-slot="carousel-next"
  {variant}
  {size}
  class={cn(
    'absolute z-40 size-8 touch-manipulation rounded-full',
    emblaCtx.orientation === 'horizontal'
      ? 'top-1/4 right-0'
      : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
    className
  )}
  disabled={!emblaCtx.canScrollNext}
  onclick={emblaCtx.scrollNext}
  onkeydown={emblaCtx.handleKeyDown}
  bind:ref
  {...restProps}
>
  <ArrowRightIcon class="size-4" />
  <span class="sr-only">Next slide</span>
</Button>
