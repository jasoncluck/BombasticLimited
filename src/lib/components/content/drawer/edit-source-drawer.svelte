<script lang="ts">
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import type { DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { Menu } from '@lucide/svelte';
  import FullHeightDrawer from './full-height-drawer.svelte';
  import type { Snippet } from 'svelte';
  import type { Source } from '$lib/constants/source';

  // Create a proper item interface with required id property for svelte-dnd-action
  interface SourceItem {
    id: string;
    source: Source;
  }

  let {
    sources,
    title = 'Reorder sources',
    subtitle = 'Drag the handle to reorder sources.',
    triggerClass = '',
    triggerVariant = 'ghost',
    onClose,
    trigger,
    onReorder,
    itemRenderer,
    emptyState,
  }: {
    sources: Source[];
    title?: string;
    subtitle?: string;
    triggerClass?: string;
    triggerVariant?:
      | 'default'
      | 'destructive'
      | 'outline'
      | 'secondary'
      | 'ghost'
      | 'link';
    onClose?: () => void;
    onReorder?: (sources: Source[]) => Promise<void> | void;
    trigger: Snippet;
    itemRenderer: Snippet<[Source, number]>;
    emptyState?: Snippet;
  } = $props();

  // Reference the snippet to satisfy TypeScript/ESLint
  const triggerSnippet = trigger;
  let editListDrawerOpen = $state(false);

  // Store the original order when drag starts
  let originalOrder: Source[] = [];
  let isDragging = $state(false);
  let pendingOrder: Source[] | null = $state(null);

  // DnD state - convert sources to proper items with unique IDs
  const flipDurationMs = 300;
  let dndItems = $state<SourceItem[]>([]);

  // Update dndItems when sources change, but respect pending order during async operations
  $effect(() => {
    if (!isDragging) {
      const sourcesToUse = pendingOrder || sources;
      dndItems = sourcesToUse.map((source) => ({
        id: source,
        source: source,
      }));

      // Clear pending order once it's been applied from the parent
      if (
        pendingOrder &&
        JSON.stringify(pendingOrder) === JSON.stringify(sources)
      ) {
        pendingOrder = null;
      }
    }
  });

  function handleDndConsider(e: CustomEvent<DndEvent<SourceItem>>) {
    isDragging = true;

    // Store original order on first consider event (drag start)
    if (originalOrder.length === 0) {
      originalOrder = [...sources];
    }

    // Update dndItems during drag (for visual feedback)
    const updatedItems = e.detail.items;
    dndItems = [...updatedItems];
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent<SourceItem>>) {
    const updatedItems = e.detail.items;
    const newOrder = updatedItems.map((item) => item.source);

    const orderChanged = !originalOrder.every(
      (source, index) => source === newOrder[index]
    );

    // Reset drag state
    const storedOriginalOrder = [...originalOrder];
    originalOrder = [];
    isDragging = false;

    if (!orderChanged) {
      // No change, revert to original order
      dndItems = storedOriginalOrder.map((source) => ({
        id: source,
        source: source,
      }));
      return;
    }

    // Set pending order immediately to prevent animation glitch
    pendingOrder = newOrder;

    // Update dndItems immediately to maintain the dropped position
    dndItems = updatedItems;

    if (onReorder) {
      try {
        await onReorder(newOrder);
        // onReorder success - pendingOrder will be cleared when parent updates sources
      } catch (error) {
        console.error('Error updating source order:', error);
        // Revert to original order on error
        pendingOrder = null;
        dndItems = storedOriginalOrder.map((source) => ({
          id: source,
          source: source,
        }));
      }
    } else {
      // No onReorder callback, just keep the new order
      pendingOrder = null;
    }
  }
</script>

<FullHeightDrawer
  {title}
  {subtitle}
  bind:open={editListDrawerOpen}
  {onClose}
  {triggerClass}
  {triggerVariant}
  handleOnly={true}
>
  {#snippet trigger()}
    {@render triggerSnippet()}
  {/snippet}

  {#if dndItems.length > 0}
    <div
      use:dragHandleZone={{
        items: dndItems,
        flipDurationMs,
        type: 'reorderable-source',
        dropTargetStyle: {
          outline: 'rgba(99, 102, 241, 0.5) solid 2px',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
        },
        morphDisabled: false,
        dropAnimationDisabled: false,
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
      class="space-y-1"
    >
      {#each dndItems as item, index (item.id)}
        <div
          animate:flip={{ duration: flipDurationMs }}
          class="content-table-row hover:bg-secondary/50 flex cursor-grab items-center gap-2 rounded p-2 transition-colors duration-200 select-none active:cursor-grabbing"
          data-item-id={item.id}
        >
          <div class="min-w-0 flex-1">
            {@render itemRenderer(item.source, index)}
          </div>
          <div
            use:dragHandle
            aria-label={`drag-handle for item ${item.source}`}
            class="hover:bg-secondary flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded"
          >
            <Menu class="text-muted-foreground h-4 w-4" />
          </div>
        </div>
      {/each}
    </div>
  {:else if emptyState}
    {@render emptyState()}
  {:else}
    <div class="flex h-32 items-center justify-center">
      <p class="text-muted-foreground">No sources to reorder</p>
    </div>
  {/if}
</FullHeightDrawer>
