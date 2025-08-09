<script lang="ts">
  import * as Resizable from '$lib/components/ui/resizable';
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar.svelte';
  import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { COLLAPSED_SIDEBAR_SIZE } from '$lib/constants/layout';
  import LoadingOverlay from './loading-overlay.svelte';
  import type { PageState } from '$lib/state/page.svelte.js';
  import type { LayoutState } from '$lib/state/layout.svelte.js';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { Snippet } from 'svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';

  let {
    supabase,
    session,
    refreshSidebar,
    pageState,
    layoutState,
    isNavigatingToContent,
    children,
  }: {
    supabase: SupabaseClient<Database>;
    session: Session | null;
    refreshSidebar: () => Promise<void>;
    pageState: PageState;
    layoutState: LayoutState;
    isNavigatingToContent: boolean;
    children: Snippet;
  } = $props();

  const sidebarState = getSidebarState();

  // Use the layout state's sidebar collapsed state
  const isSidebarCollapsed = $derived(layoutState.isSidebarCollapsed);
</script>

<Resizable.PaneGroup
  direction="horizontal"
  class="flex h-full overflow-hidden rounded-lg"
  autoSaveId="bombastic-layout"
>
  <!-- Sidebar Pane (Desktop Only) -->
  <Resizable.Pane
    defaultSize={15}
    minSize={12}
    maxSize={50}
    collapsedSize={COLLAPSED_SIDEBAR_SIZE}
    collapsible={true}
    onCollapse={() => layoutState.setSidebarCollapsed(true)}
    onExpand={() => layoutState.setSidebarCollapsed(false)}
    class="pane @container hidden h-full grow flex-col sm:ml-2 sm:flex {isSidebarCollapsed
      ? 'max-w-[75px] min-w-[75px]'
      : 'min-w-[200px]'}"
  >
    <ScrollArea
      type="scroll"
      class="h-full grow"
      bind:viewportRef={pageState.viewportRefs.sidebarViewportRef}
      data-scroll-area="sidebar"
    >
      <!-- Fixed height container to prevent layout shifts -->
      <div class="min-h-full">
        {#if sidebarState.showPlaceholder}
          <!-- Skeleton with exact dimensions matching real sidebar -->
          <aside class="h-full overflow-hidden">
            <!-- Sources Section Skeleton -->
            <div class="flex flex-col {!isSidebarCollapsed ? 'mx-2' : 'mx-1'}">
              <!-- Fixed number of source items with exact heights -->
              {#each Array(4)}
                <SidebarItem isLoading={true} {isSidebarCollapsed} />
              {/each}
            </div>

            <!-- Divider with exact spacing -->
            <div class="mx-2 my-2">
              <Skeleton class="h-px w-full" />
            </div>

            <!-- Playlists Header Section Skeleton with exact dimensions -->
            <div
              class="m-3 flex flex-col {!isSidebarCollapsed
                ? 'mx-6 items-start'
                : 'items-center'}"
            >
              <div class="flex h-[44px] items-center">
                {#if !isSidebarCollapsed}
                  <!-- Full header with exact spacing matching real content structure -->
                  <Skeleton class="my-1 h-9 w-9 flex-shrink-0 rounded-full" />
                  <h2
                    class="ml-4 text-lg font-semibold tracking-tight opacity-50"
                  >
                    Playlists
                  </h2>
                {:else}
                  <!-- Collapsed header - centered circle -->
                  <Skeleton class="my-1 h-9 w-9 flex-shrink-0 rounded-full" />
                {/if}
              </div>
            </div>

            <!-- Playlists Container Skeleton with exact border and spacing -->
            <div
              class="rounded-md border-2 border-transparent {!isSidebarCollapsed
                ? 'mx-2'
                : 'mx-1'}"
            >
              <div
                class="flex flex-col {isSidebarCollapsed ? 'items-center' : ''}"
              >
                <!-- Fixed number of playlist items -->
                {#each Array(6), i}
                  <SidebarItem
                    isLoading={true}
                    {isSidebarCollapsed}
                    showSpecialIcon={true}
                    iconIndex={i}
                    class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 {!isSidebarCollapsed
                      ? 'w-full'
                      : 'w-12'}"
                  />
                {/each}
              </div>
            </div>
          </aside>
        {:else}
          <Sidebar {isSidebarCollapsed} {supabase} {session} {refreshSidebar} />
        {/if}
      </div>
    </ScrollArea>
  </Resizable.Pane>

  <!-- Resizable Handle -->
  <Resizable.Handle
    onDraggingChange={(isDragging) =>
      (layoutState.isDraggingDivider = isDragging)}
    draggable={true}
    class="bg-background end-[2px] hidden w-1 after:h-[calc(100%-16px)] after:transition 
    after:duration-300 after:ease-out sm:ml-1 sm:flex
    {layoutState.isDraggingDivider
      ? 'after:bg-foreground after:w-[1px]'
      : 'hover:after:bg-muted-foreground after:w-[1px]'}"
  />

  <!-- Main Content Pane -->
  <Resizable.Pane
    defaultSize={85}
    class="pane @container flex min-w-[350px] sm:mr-1"
  >
    <ScrollArea
      type="scroll"
      orientation="vertical"
      class="w-full"
      bind:viewportRef={pageState.viewportRefs.contentViewportRef}
      data-scroll-area="content"
    >
      <!-- Simplified content wrapper to reduce nesting -->
      <div class="min-h-full w-full">
        <div class="m-2 flex items-start justify-center sm:m-4">
          <div class="w-full max-w-[1000px] @xl:max-w-[1450px]">
            <div class="relative mb-20 flex flex-col">
              <LoadingOverlay {isNavigatingToContent} />
              {@render children()}
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  </Resizable.Pane>
</Resizable.PaneGroup>
