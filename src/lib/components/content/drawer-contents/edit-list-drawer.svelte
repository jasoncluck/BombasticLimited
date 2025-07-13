<script lang="ts">
  import { dragHandleZone, dragHandle } from "svelte-dnd-action";
  import type { DndEvent } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { Menu } from "@lucide/svelte";
  import { getDrawerState } from "$lib/state/drawer.svelte";
  import type { Video } from "$lib/supabase/videos";
  import type { Playlist } from "$lib/supabase/playlists";
  import { SOURCE_INFO } from "$lib/constants/source";

  // Base interface that all reorderable items must implement
  interface ReorderableBase {
    id: string | number;
  }

  // Union type for specific known types
  type ReorderableItem = Video | Playlist | ReorderableBase;

  let {
    items,
    onClose,
    onReorder,
  }: {
    items: ReorderableItem[];
    onClose?: () => void;
    onReorder?: (
      oldIndex: number,
      newIndex: number,
      item: ReorderableItem,
    ) => Promise<void> | void;
  } = $props();

  const drawerState = getDrawerState();

  // Store the original order when drag starts
  let originalOrder: (string | number)[] = [];
  let isReordering = $state(false);

  // DnD state
  const flipDurationMs = 300;
  let dndItems = $derived(
    items?.map((item) => ({
      ...item,
      id: item.id, // Ensure each item has a unique id
    })) || [],
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
      (id, index) => id === newOrder[index],
    );

    // Reset original order for next drag operation
    const storedOriginalOrder = [...originalOrder]; // Keep a copy for revert
    originalOrder = [];

    if (!orderChanged) {
      // Revert to original order
      const originalItems = storedOriginalOrder.map(
        (id) => items.find((item) => item.id === id)!,
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
        isReordering = true;
        try {
          await onReorder(oldIndex, newIndex, movedItem);
        } catch {
          // Revert to original order on error
          const originalItems = storedOriginalOrder.map(
            (id) => items.find((item) => item.id === id)!,
          );
          items = originalItems;
          return;
        } finally {
          isReordering = false;
        }
      }
    }

    // Update the final items state to match the new order
    items = updatedItems;
  }

  function handleClose() {
    onClose?.();
    drawerState.close();
  }

  // Add a custom footer with Done button
  $effect(() => {
    const footer = document.getElementById("drawer-footer");
    if (footer) {
      // Clear existing custom buttons
      const existingButtons = footer.querySelectorAll(
        "[data-edit-list-button]",
      );
      existingButtons.forEach((btn) => btn.remove());

      // Add Done button before Close button
      const doneButton = document.createElement("button");
      doneButton.setAttribute("data-edit-list-button", "true");
      doneButton.type = "button";
      doneButton.className =
        "drawer-button-footer bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md text-sm font-medium";
      doneButton.textContent = "Done";
      doneButton.onclick = handleClose;

      const closeButton = footer.querySelector(
        'button[type="button"]:not([data-edit-list-button])',
      );
      if (closeButton) {
        footer.insertBefore(doneButton, closeButton);
        // Hide the default close button since we have our own
        (closeButton as HTMLElement).style.display = "none";
      } else {
        footer.appendChild(doneButton);
      }
    }

    // Cleanup function
    return () => {
      const footer = document.getElementById("drawer-footer");
      if (footer) {
        const customButtons = footer.querySelectorAll(
          "[data-edit-list-button]",
        );
        customButtons.forEach((btn) => btn.remove());

        // Show the default close button again
        const closeButton = footer.querySelector(
          'button[type="button"]:not([data-edit-list-button])',
        );
        if (closeButton) {
          (closeButton as HTMLElement).style.display = "";
        }
      }
    };
  });
</script>

<!-- Main content area for the reorder drawer -->
<div class="flex-1 overflow-y-auto px-4 min-h-0">
  {#if dndItems.length > 0}
    <div
      use:dragHandleZone={{
        items: dndItems,
        flipDurationMs,
        type: "reorderable-item",
        dropTargetStyle: {
          outline: "rgba(99, 102, 241, 0.5) solid 2px",
          backgroundColor: "rgba(99, 102, 241, 0.1)",
        },
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
      class="space-y-2 py-2"
    >
      {#each dndItems as item, index (item.id)}
        {@const video = item as Video}
        <div
          animate:flip={{ duration: flipDurationMs }}
          class="flex gap-3 items-center content-table-row select-none transition-colors duration-200 hover:bg-secondary/50 p-3 rounded-lg border bg-background cursor-grab active:cursor-grabbing {isReordering
            ? 'opacity-50'
            : ''}"
        >
          <!-- Video thumbnail -->
          <div class="flex-shrink-0">
            <img
              src={video.thumbnail_url}
              alt={video.title}
              class="h-16 aspect-video rounded object-cover pointer-events-none"
            />
          </div>

          <!-- Video info -->
          <div class="flex flex-col gap-1 flex-1 min-w-0 pointer-events-none">
            <h3 class="font-medium text-sm break-words line-clamp-2 leading-5">
              {video.title}
            </h3>
            <p class="text-xs text-muted-foreground">
              {SOURCE_INFO[video.source]?.displayName || video.source}
            </p>
            <p class="text-xs text-muted-foreground">
              Position: {index + 1}
            </p>
          </div>

          <!-- Drag handle -->
          <div
            use:dragHandle
            aria-label={`drag-handle for item ${item.id}`}
            class="flex items-center justify-center w-8 h-8 cursor-grab hover:bg-secondary rounded shrink-0 touch-manipulation"
          >
            <Menu class="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      {/each}
    </div>

    {#if isReordering}
      <div
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      >
        <div class="bg-background p-4 rounded-lg shadow-lg">
          <p class="text-sm">Updating order...</p>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex flex-col items-center justify-center h-64 text-center">
      <div class="text-muted-foreground mb-2">
        <Menu class="h-12 w-12 mx-auto mb-4 opacity-50" />
      </div>
      <h3 class="text-lg font-medium mb-2">No videos to reorder</h3>
      <p class="text-sm text-muted-foreground max-w-sm">
        Add some videos to this playlist to start reordering them.
      </p>
    </div>
  {/if}
</div>
