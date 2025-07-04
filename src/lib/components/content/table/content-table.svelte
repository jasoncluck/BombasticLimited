<script lang="ts" generics="TValue">
  import { type ColumnDef, getCoreRowModel } from "@tanstack/table-core";
  import {
    createSvelteTable,
    FlexRender,
  } from "$lib/components/ui/data-table/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { handleContentNavigation } from "../content";
  import type { Playlist } from "$lib/supabase/playlists";
  import { type Video } from "$lib/supabase/videos";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { CombinedContentFilter } from "../content-filter";

  type DataTableProps<TValue> = {
    columns: ColumnDef<Video, TValue>[];
    videos: Video[];
    playlist?: Playlist;
    contentFilter: CombinedContentFilter;
    supabase: SupabaseClient<Database>;
    session: Session | null;
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
    contentFilter,
    videosCount,
    onDataUpdate,
    supabase,
    session,
  }: DataTableProps<TValue> = $props();

  const contentState = getContentState();

  const allowVideoReorder = $derived(
    !!playlist &&
      playlist.created_by === session?.user.id &&
      contentFilter.sort.key === "playlistOrder",
  );

  // Create drag drop functionality if reordering is allowed and we have the required dependencies
  const dragDrop = $derived(
    session
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
      : null,
  );

  const table = createSvelteTable({
    get data() {
      return videos;
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedVideoIds = $derived(
    contentState.selectedVideos.length > 0
      ? new Set((contentState.selectedVideos || []).map((v) => v.id))
      : new Set(),
  );

  function getRowClasses(video: Video, index: number) {
    let classes = "selection-mode transition-none";

    const isSelected = selectedVideoIds.has(video.id);

    if (isSelected) {
      // Selected state - using !important to override hover
      classes += " !bg-secondary brightness-125";
    } else {
      // Not selected - allow hover effects
      classes += " hover:bg-secondary/75";
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      // Use the new drag classes method instead of the old border approach
      classes += ` ${contentState.getVideoDragClasses(index)}`;
    }

    return classes;
  }

  // Add function to handle mouse leaving the entire table
  function handleTableMouseLeave() {
    contentState.hoveredVideo = null;
    contentState.manualHover = false;
    // Clear any pending timeout
    if (contentState.hoverTimeoutId) {
      clearTimeout(contentState.hoverTimeoutId);
      contentState.hoverTimeoutId = null;
    }
  }
</script>

<Table.Root class="outline-none" onmouseleave={handleTableMouseLeave}>
  <Table.Body class="-mx-2">
    {#each table.getRowModel().rows as row, i (row.id)}
      <Table.Row
        data-state={row.getIsSelected() && "selected"}
        class={getRowClasses(row.original, i)}
        draggable={true}
        ondragstart={dragDrop
          ? (e) => dragDrop.handleDragStart(e, i)
          : undefined}
        ondragover={dragDrop ? (e) => dragDrop.handleDragOver(e, i) : undefined}
        ondragleave={dragDrop ? (e) => dragDrop.handleDragLeave(e) : undefined}
        ondrop={dragDrop ? (e) => dragDrop.handleDrop(e, i) : undefined}
        ondragend={dragDrop ? dragDrop.handleDragEnd : undefined}
        onclick={(e) => {
          e.preventDefault();
          contentState.handleVideoClick({
            event: e,
            video: row.original,
            videos,
            playlist,
            onNavigate: (video, playlist) => {
              handleContentNavigation({
                video,
                contentFilter,
                playlist,
              });
            },
          });
        }}
        oncontextmenu={(event) => {
          const isCtrlPressed = event.ctrlKey || event.metaKey;

          if (isCtrlPressed) {
            event.preventDefault();
            event.stopPropagation();

            // Manually trigger selection since context menu is prevented
            contentState.handleSelectVideos({
              event,
              video: row.original,
              videos,
            });

            return false;
          } else {
            // Handle right-click context menu behavior
            contentState.handleContextMenu({
              event,
              video: row.original,
            });
          }
        }}
        onmouseenter={() =>
          contentState.handleMouseEnter({
            video: row.original,
            shouldScrollCheck: true,
          })}
        onmouseleave={() => contentState.handleMouseLeave()}
      >
        {#each row.getVisibleCells() as cell (cell.id)}
          <Table.Cell>
            <FlexRender
              content={cell.column.columnDef.cell}
              context={cell.getContext()}
            />
          </Table.Cell>
        {/each}
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
