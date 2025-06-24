<script lang="ts" generics="TData, TValue">
  import {
    type ColumnDef,
    getCoreRowModel,
    type Row,
  } from "@tanstack/table-core";
  import {
    createSvelteTable,
    FlexRender,
  } from "$lib/components/ui/data-table/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { getContentState } from "$lib/state/content.svelte";
  import { pageState } from "$lib/state/page.svelte";

  type DataTableProps<TData, TValue> = {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
  };

  let { data, columns }: DataTableProps<TData, TValue> = $props();
  const contentState = getContentState();
  let isHoveringCard = $state(false);

  const table = createSvelteTable({
    get data() {
      return data;
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
</script>

<div class="rounded-md">
  <Table.Root>
    <Table.Header class="sticky top-[44px] left-0 z-10 w-full">
      {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
        <Table.Row class="border-b">
          {#each headerGroup.headers as header (header.id)}
            <Table.Head class="bg-background-lighter sticky top-0">
              {#if !header.isPlaceholder}
                <FlexRender
                  content={header.column.columnDef.header}
                  context={header.getContext()}
                />
              {/if}
            </Table.Head>
          {/each}
        </Table.Row>
      {/each}
    </Table.Header>
    <Table.Body>
      {#each table.getRowModel().rows as row (row.id)}
        <Table.Row data-state={row.getIsSelected() && "selected"}>
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
</div>
