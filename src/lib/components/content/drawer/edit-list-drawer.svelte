<script lang="ts">
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import type { DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { Menu } from '@lucide/svelte';
  import FullHeightDrawer from './full-height-drawer.svelte';
  import type { Video } from '$lib/supabase/videos';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Snippet } from 'svelte';

  // Base interface that all reorderable items must implement
  interface ReorderableBase {
    id: string | number;
  }

  // Union type for specific known types
  type ReorderableItem = Video | Playlist | ReorderableBase;

  let {
    items,
    title = 'Reorder items',
    subtitle = 'Drag the handle to reorder items.',
    triggerClass = '',
    triggerVariant = 'ghost',
    onClose,
    trigger,
    onReorder,
    itemRenderer,
    emptyState,
  }: {
    items: ReorderableItem[];
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
    onReorder?: (
      oldIndex: number,
      newIndex: number,
      item: ReorderableItem
    ) => Promise<void> | void;
    trigger: Snippet;
    itemRenderer: Snippet<[ReorderableItem, number]>;
    emptyState?: Snippet;
  } = $props();

  // Reference the snippet to satisfy TypeScript/ESLint
  const triggerSnippet = trigger;
  let editListDrawerOpen = $state(false);

  // Store the original order when drag starts
  let originalOrder: (string | number)[] = [];

  // DnD state
  const flipDurationMs = 300;
  let dndItems = $derived(
    items?.map((item) => ({
      ...item,
      id: item.id, // Ensure each item has a unique id
    })) || []
  );

  function handleDndConsider(e: CustomEvent<DndEvent>) {
    // Store original order on first consider event (drag start)
    if (originalOrder.length === 0) {
      originalOrder = items.map((item) => item.id);
    }

    // Update items during drag (for visual feedback)
    const updatedItems = e.detail.items as typeof dndItems;
    items = [...updatedItems];
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent>) {
    const updatedItems = e.detail.items as typeof dndItems;

    // Use the stored original order instead of current items order
    const newOrder = updatedItems.map((item) => item.id);

    const orderChanged = !originalOrder.every(
      (id, index) => id === newOrder[index]
    );

    // Reset original order for next drag operation
    const storedOriginalOrder = [...originalOrder]; // Keep a copy for revert
    originalOrder = [];

    if (!orderChanged) {
      // Revert to original order
      const originalItems = storedOriginalOrder.map(
        (id) => items.find((item) => item.id === id)!
      );
      items = originalItems;
      return;
    }

    // Find the item that moved the most (the dragged item)
    let movedItemId: string | number | null = null;
    let maxPositionChange = 0;
    let oldIndex = -1;
    let newIndex = -1;

    storedOriginalOrder.forEach((id, origIndex) => {
      const newPos = newOrder.indexOf(id);
      const positionChange = Math.abs(origIndex - newPos);

      if (positionChange > maxPositionChange) {
        maxPositionChange = positionChange;
        movedItemId = id;
        oldIndex = origIndex;
        newIndex = newPos;
      }
    });

    if (movedItemId && maxPositionChange > 0) {
      const movedItem = items.find((item) => item.id === movedItemId);

      if (movedItem && onReorder) {
        try {
          await onReorder(oldIndex, newIndex, movedItem);
        } catch {
          // Revert to original order on error
          const originalItems = storedOriginalOrder.map(
            (id) => items.find((item) => item.id === id)!
          );
          items = originalItems;
          return;
        }
      }
    }

    // Update the final items state to match the new order
    items = updatedItems;
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
        type: 'reorderable-item',
        dropTargetStyle: {
          outline: 'rgba(99, 102, 241, 0.5) solid 2px',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
        },
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
      {#each dndItems as item, index (item.id)}
        <div
          animate:flip={{ duration: flipDurationMs }}
          class="content-table-row hover:bg-secondary/50 flex cursor-grab items-center gap-2 rounded p-2 transition-colors duration-200 select-none active:cursor-grabbing"
        >
          {@render itemRenderer(item, index)}
          <div
            use:dragHandle
            aria-label={`drag-handle for item ${item.id}`}
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
      <p class="text-muted-foreground">No items to reorder</p>
    </div>
  {/if}
</FullHeightDrawer>
