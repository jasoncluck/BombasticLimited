<script lang="ts">
  import { ListVideo, Loader2 } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let {
    isLoading = false,
    isSidebarCollapsed = false,
    showSpecialIcon = false,
    iconIndex = 0,
    imageUrl,
    imageAlt,
    title,
    class: className = '',
    ...restProps
  }: {
    isLoading?: boolean;
    isSidebarCollapsed?: boolean;
    showSpecialIcon?: boolean;
    iconIndex?: number;
    imageUrl?: string;
    imageAlt?: string;
    title?: string;
    children?: Snippet;
    class?: string;
  } = $props();

  // Consistent container classes for both states
  const containerClasses = $derived(
    `flex items-center transition-all duration-200 ease-in-out ${
      !isSidebarCollapsed
        ? 'h-[56px] px-2 py-1'
        : 'h-[56px] justify-center px-1 py-1'
    } ${className}`
  );
</script>

<div class={containerClasses} {...restProps}>
  {#if isLoading}
    <!-- Simple centered loader -->
    <div class="flex h-full w-full items-center justify-center">
      <Loader2 class="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  {:else}
    <!-- Real content with exact same structure -->
    <div
      class="absolute flex grow items-center {!isSidebarCollapsed
        ? 'w-full grow'
        : 'item-center'}"
    >
      {#if imageUrl}
        <div class="h-12 w-12 shrink-0">
          <img
            src={imageUrl}
            alt={imageAlt || title || ''}
            class="h-full w-full cursor-pointer rounded object-cover"
            loading="lazy"
          />
        </div>
      {:else}
        <!-- Default icon fallback -->
        <div
          class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded"
        >
          <ListVideo class="!h-8 !w-8" />
        </div>
      {/if}

      {#if !isSidebarCollapsed && title}
        <span
          class="mr-6 max-h-10 justify-start overflow-hidden px-3 text-left text-sm text-wrap"
        >
          {title}
        </span>
      {/if}
    </div>
  {/if}
</div>
