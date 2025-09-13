<script lang="ts" generics="TValue">
  import { type ColumnDef, getCoreRowModel } from '@tanstack/table-core';
  import {
    createSvelteTable,
    FlexRender,
  } from '$lib/components/ui/data-table/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import { handleContentNavigation } from '../content';
  import type { Playlist } from '$lib/supabase/playlists';
  import { type Video } from '$lib/supabase/videos';
  import { getContentState } from '$lib/state/content.svelte';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { CombinedContentFilter } from '../content-filter';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { onMount } from 'svelte';

  type DataTableProps<TValue> = {
    columns: ColumnDef<Video, TValue>[];
    videos: Video[];
    playlist?: Playlist;
    contentFilter: CombinedContentFilter;
    isContinueVideos?: boolean;
    allowVideoReorder?: boolean;
    sectionId: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    videosCount?: number | null;
    handleDragStart?: (
      e: DragEvent & { currentTarget: HTMLDivElement },
      index: number
    ) => void;
  };

  let {
    videos = $bindable(),
    columns,
    playlist,
    sectionId,
    contentFilter,
    allowVideoReorder = false,
    videosCount,
    supabase,
  }: DataTableProps<TValue> = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  const selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  const selectedVideoIds = $derived(
    selectedVideos.length > 0
      ? new Set(selectedVideos.map((v) => v.id))
      : new Set()
  );

  const dragDrop = $derived(
    contentState.createDragDrop({
      allowVideoReorder,
      videos,
      videosCount,
      playlist,
      contentFilter,

      clearSelection: mediaQueryState.canHover ? false : true,

      supabase,
      onVideosUpdate: (updatedVideos) => {
        videos = updatedVideos;
      },
    })
  );

  const table = createSvelteTable({
    get data() {
      return videos;
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function getRowClasses(video: Video, index: number) {
    let classes = 'selection-mode transition-none content-table-row';

    const isSelected = selectedVideoIds.has(video.id);
    const hoveredVideo = contentState.hoveredVideosBySection[sectionId];
    const isHovered = hoveredVideo?.id === video.id;
    const isDragging = contentState.dragContentType === 'video';

    if (isSelected) {
      // Selected state - using !important to override hover
      classes += ' !bg-secondary brightness-110';
    } else if (isHovered && !isDragging) {
      // Hovered state - only apply when not dragging and not selected
      classes += ' bg-secondary/75';
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      // Use the new drag classes method instead of the old border approach
      classes += ` ${contentState.getVideoDragClasses(index, 'TABLE')}`;
    }

    return classes;
  }

  // Add function to handle mouse leaving the entire table
  function handleTableMouseLeave() {
    contentState.hoveredVideosBySection[sectionId] = null;
    // Clear any pending timeout
    if (contentState.hoverTimeoutId) {
      clearTimeout(contentState.hoverTimeoutId);
      contentState.hoverTimeoutId = null;
    }
  }
</script>

<Table.Root
  class="content-table outline-hiddden"
  data-testid="content-table-{sectionId}"
  onmouseleave={handleTableMouseLeave}
>
  <Table.Body>
    {#each table.getRowModel().rows as row, i (row.id)}
      <Table.Row
        data-testid="content-item"
        data-state={row.getIsSelected() && 'selected'}
        class={getRowClasses(row.original, i)}
        draggable={true}
        ondragstart={(e) => dragDrop.handleDragStart(e, i, sectionId)}
        ondragover={(e) => dragDrop.handleDragOver(e, i)}
        ondragleave={(e) => dragDrop.handleDragLeave(e)}
        ondrop={(e) => dragDrop.handleDrop(e, i, sectionId)}
        ondragend={dragDrop.handleDragEnd}
        onclick={(e) => {
          contentState.handleVideoClick({
            event: e,
            video: row.original,
            videos,
            playlist,
            sectionId,
            enableDoubleClick: mediaQueryState.canHover ? true : false,
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
              sectionId,
            });

            return false;
          } else {
            // Handle right-click context menu behavior
            contentState.handleContextMenu({
              video: row.original,
              sectionId,
            });
          }
        }}
        onmouseenter={() =>
          contentState.handleMouseEnter({
            video: row.original,
            sectionId,
          })}
        onmouseleave={() =>
          contentState.handleMouseLeave({
            sectionId,
          })}
      >
        {#each row.getVisibleCells() as cell (cell.id)}
          <Table.Cell
            class="content-table-row overflow-hidden py-2 align-top {cell.id.includes(
              'image'
            )
              ? 'pl-0'
              : 'pl-2'}"
          >
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
