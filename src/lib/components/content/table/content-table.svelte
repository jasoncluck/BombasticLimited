<script lang="ts" generics="TValue">
  import { type ColumnDef, getCoreRowModel } from "@tanstack/table-core";
  import {
    createSvelteTable,
    FlexRender,
  } from "$lib/components/ui/data-table/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { handleContentNavigation } from "../content";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import { getContentState } from "$lib/state/content.svelte";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { CombinedContentFilter } from "../content-filter";

  type DataTableProps<TValue> = {
    columns: ColumnDef<Video, TValue>[];
    videos: Video[];
    playlist?: Playlist;
    allowVideoReorder?: boolean;
    contentFilter?: CombinedContentFilter;
    supabase?: SupabaseClient<Database>;
    session?: Session | null;
    videosCount?: number | null;
    onDataUpdate?: (data: Video[]) => void;
    handleDragStart?: (
      e: DragEvent & { currentTarget: HTMLDivElement },
      index: number,
    ) => void;
  };

  let {
    videos = $bindable(),
    columns,
    playlist,
    allowVideoReorder = false,
    contentFilter,
    videosCount,
    onDataUpdate,
    supabase,
    session,
  }: DataTableProps<TValue> = $props();

  const contentState = getContentState();

  // Create drag drop functionality if reordering is allowed and we have the required dependencies
  const dragDrop = session
    ? contentState.createDragDrop({
        allowVideoReorder,
        videos,
        videosCount,
        playlist,
        contentFilter,
        supabase,
        onVideosUpdate: (updatedVideos) => {
          videos = updatedVideos;
          onDataUpdate?.(videos);
        },
      })
    : null;

  const table = createSvelteTable({
    get data() {
      return videos;
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function getRowClasses(index: number) {
    let classes = `cursor-pointer ${contentState.isSelectionMode ? "selection-mode" : ""}`;

    // Add selection highlighting
    if (contentState.selectedVideos.some((v) => v.id === videos[index].id)) {
      classes += " bg-muted/50";
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      if (contentState.draggedIndex === index) {
        classes += " opacity-60";
      }
      if (contentState.targetIndex === index) {
        if (
          !contentState.draggedIndex ||
          contentState.draggedIndex < contentState.targetIndex
        ) {
          classes += " border-b-2 border-primary";
        } else {
          classes += " border-t-2 border-primary";
        }
      }
    }

    return classes;
  }
</script>

<Table.Root>
  <Table.Body class="-mx-2">
    {#each table.getRowModel().rows as row, i (row.id)}
      <Table.Row
        data-state={row.getIsSelected() && "selected"}
        class={getRowClasses(i)}
        draggable={true}
        ondragstart={dragDrop
          ? (e) => dragDrop.handleDragStart(e, i)
          : undefined}
        ondragover={dragDrop ? (e) => dragDrop.handleDragOver(e, i) : undefined}
        ondragleave={dragDrop ? (e) => dragDrop.handleDragLeave(e) : undefined}
        ondrop={dragDrop ? (e) => dragDrop.handleDrop(e, i) : undefined}
        ondragend={dragDrop ? dragDrop.handleDragEnd : undefined}
        onclick={contentState.isSelectionMode
          ? (e) => {
              e.preventDefault();
              contentState.handleSelectVideos({
                event: e,
                video: row.original,
                videos,
              });
            }
          : (e) => {
              e.stopPropagation();
              handleContentNavigation({
                video: row.original,
                playlist,
              });
            }}
        onmouseenter={() =>
          contentState.handleMouseEnter({ video: row.original })}
        onmouseleave={() => contentState.handleMouseLeave()}
      >
        {#if contentState.isSelectionMode}
          <Table.Cell class="w-12">
            <Checkbox
              id={row.original.id}
              checked={contentState.selectedVideos.some(
                (v) => v.id === row.original.id,
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
