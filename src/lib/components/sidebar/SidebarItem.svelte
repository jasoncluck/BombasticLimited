<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { ListVideo } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let {
    isLoading = false,
    isSidebarCollapsed = false,
    showSpecialIcon = false,
    iconIndex = 0,
    imageUrl,
    imageAlt,
    title,
    children,
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
    [key: string]: any;
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
    <!-- Skeleton state with exact same structure as real content -->
    {#if !isSidebarCollapsed}
      <!-- Full width skeleton with exact spacing matching real content -->
      <div class="flex w-full items-center space-x-3">
        {#if showSpecialIcon && iconIndex % 3 !== 0}
          <!-- Special icon case for playlists -->
          <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center">
            <div
              class="bg-muted flex h-12 w-12 animate-pulse items-center justify-center rounded"
            >
              <ListVideo class="text-muted-foreground h-8 w-8 opacity-50" />
            </div>
          </div>
        {:else}
          <Skeleton class="h-12 w-12 flex-shrink-0 rounded" />
        {/if}
        <div class="min-w-0 flex-1">
          <Skeleton class="h-4 w-full" />
        </div>
      </div>
    {:else}
      <!-- Collapsed skeleton -->
      {#if showSpecialIcon && iconIndex % 3 !== 0}
        <!-- Special icon case for playlists -->
        <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center">
          <div
            class="bg-muted flex h-12 w-12 animate-pulse items-center justify-center rounded"
          >
            <ListVideo class="text-muted-foreground h-8 w-8 opacity-50" />
          </div>
        </div>
      {:else}
        <Skeleton class="h-12 w-12 flex-shrink-0 rounded" />
      {/if}
    {/if}
  {:else if children}
    <!-- Custom content provided via children snippet -->
    {@render children()}
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
