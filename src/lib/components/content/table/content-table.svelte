<script lang="ts" generics="TData, TValue">
  import { type ColumnDef, getCoreRowModel } from "@tanstack/table-core";
  import {
    createSvelteTable,
    FlexRender,
  } from "$lib/components/ui/data-table/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import IntersectionObserver from "$lib/components/intersection-observer.svelte";
  import { handleContentNavigation } from "../content";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import { getContentState } from "$lib/state/content.svelte";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";

  type DataTableProps<TData, TValue> = {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    playlist?: Playlist;
  };

  let { data, columns, playlist }: DataTableProps<TData, TValue> = $props();

  let isTableVisible = $state(true);
  const contentState = getContentState();

  const table = createSvelteTable({
    get data() {
      return data;
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function handleSelectVideos(event: MouseEvent, video: Video) {
    const isShiftPressed = event.shiftKey;
    const videoIndex = contentState.selectedVideos.findIndex(
      (v) => v.id === video.id,
    );

    if (!isShiftPressed) {
      // Original behavior when SHIFT is not pressed
      if (videoIndex === -1) {
        contentState.selectedVideos.push(video);
      } else {
        contentState.selectedVideos.splice(videoIndex, 1);
      }
    } else {
      // SHIFT key is pressed - implement range selection
      // If no videos are selected yet, just add this one
      if (contentState.selectedVideos.length === 0) {
        contentState.selectedVideos.push(video);
      } else {
        const lastSelectedVideo =
          contentState.selectedVideos[contentState.selectedVideos.length - 1];

        const lastSelectedIndex = data.findIndex(
          (v) => (v as Video).id === lastSelectedVideo.id,
        );
        const currentIndex = data.findIndex(
          (v) => (v as Video).id === video.id,
        );

        // Determine start and end indices for the range
        const startIndex = Math.min(lastSelectedIndex, currentIndex);
        const endIndex = Math.max(lastSelectedIndex, currentIndex);

        // Select all videos in the range
        for (let i = startIndex; i <= endIndex; i++) {
          const rangeVideo = data[i] as Video;
          // Check if this video is not already in selectedVideos
          if (
            !contentState.selectedVideos.some((v) => v.id === rangeVideo.id)
          ) {
            contentState.selectedVideos.push(rangeVideo);
          }
        }
      }
    }
  }

  function handleMouseEnter(video: Video) {
    if (!contentState.isSelectionMode && !contentState.dragContentType) {
      // Clear any existing timeout when entering a new row
      if (contentState.hoverTimeoutId) {
        clearTimeout(contentState.hoverTimeoutId);
        contentState.hoverTimeoutId = null;
      }

      contentState.selectedVideos = [video];
    }
  }

  function handleMouseLeave() {
    if (!contentState.isSelectionMode) {
      // Store the timeout ID so it can be cleared if needed
      const timeoutId = setTimeout(() => {
        if (
          !contentState.dragContentType &&
          !contentState.isMouseOverContextMenu
        ) {
          contentState.selectedVideos = [];
        }
        contentState.hoverTimeoutId = null;
      }, 50);
      contentState.hoverTimeoutId = timeoutId;
    }
  }
</script>

<IntersectionObserver
  threshold={0.1}
  disableObserver={false}
  onActive={() => (isTableVisible = true)}
  onInactive={() => (isTableVisible = false)}
>
  <Table.Root>
    <Table.Body class="-mx-2">
      {#each table.getRowModel().rows as row (row.id)}
        <Table.Row
          data-state={row.getIsSelected() && "selected"}
          class="cursor-pointer {contentState.selectedVideos.some(
            (v) => v.id === (row.original as Video).id,
          )
            ? 'bg-muted/50'
            : ''}"
          onclick={contentState.isSelectionMode
            ? (e) => {
                e.preventDefault();
                handleSelectVideos(e, row.original as Video);
              }
            : (e) => {
                e.preventDefault();
                handleContentNavigation({
                  video: row.original as Video,
                  playlist,
                });
              }}
          onmouseenter={() => handleMouseEnter(row.original as Video)}
          onmouseleave={handleMouseLeave}
        >
          {#if contentState.isSelectionMode}
            <Table.Cell class="w-12">
              <Checkbox
                id={(row.original as Video).id}
                checked={contentState.selectedVideos.some(
                  (v) => v.id === (row.original as Video).id,
                )}
                class="pointer-events-none"
              />
            </Table.Cell>
          {/if}
          {#each row.getVisibleCells() as cell (cell.id)}
            <Table.Cell>
              <FlexRender
                content={cell.column.columnDef.cell}
                context={cell.getContext()}
              />
            </Table.Cell>
          {/each}
        </Table.Row>
      {:else}
        <Table.Row>
          <Table.Cell colspan={columns.length} class="h-24 text-center">
            No Results Found
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</IntersectionObserver>
