<script lang="ts">
  import * as Resizable from '$lib/components/ui/resizable';
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar.svelte';
  import { COLLAPSED_SIDEBAR_SIZE } from '$lib/constants/layout';
  import LoadingOverlay from './loading-overlay.svelte';
  import type { PageState } from '$lib/state/page.svelte.js';
  import type { LayoutState } from '$lib/state/layout.svelte.js';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { Snippet } from 'svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';

  let {
    layout,
    isSidebarCollapsed = $bindable(),
    supabase,
    session,
    refreshSidebar,
    pageState,
    layoutState,
    isNavigatingToContent,
    children,
  }: {
    layout?: number[] | null;
    isSidebarCollapsed: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    refreshSidebar: () => Promise<void>;
    pageState: PageState;
    layoutState: LayoutState;
    isNavigatingToContent: boolean;
    children: Snippet;
  } = $props();

  const sidebarState = getSidebarState();

  // Get initial sidebar state from cookies
  const initialDefaultSize = sidebarState.getDefaultSizeFromCookie() ?? (layout?.[0] ?? 15);
  const initialCollapsed = sidebarState.collapsed;

  // Initialize the bindable collapsed state from sidebar state
  if (isSidebarCollapsed !== initialCollapsed) {
    isSidebarCollapsed = initialCollapsed;
  }
</script>

<Resizable.PaneGroup
  direction="horizontal"
  class="flex h-full overflow-hidden rounded-lg"
  onLayoutChange={(sizes) => {
    layoutState.onLayoutChange(sizes);
    // Save sidebar state with the current pane size
    sidebarState.saveStateToCookie(isSidebarCollapsed, sizes[0]);
  }}
>
  <!-- Sidebar Pane (Desktop Only) -->
  <Resizable.Pane
    defaultSize={initialDefaultSize}
    minSize={12}
    maxSize={50}
    collapsedSize={COLLAPSED_SIDEBAR_SIZE}
    collapsible={true}
    onCollapse={() => {
      isSidebarCollapsed = true;
      sidebarState.setCollapsed(true);
    }}
    onExpand={() => {
      isSidebarCollapsed = false;
      sidebarState.setCollapsed(false);
    }}
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
        <Sidebar {isSidebarCollapsed} {supabase} {session} {refreshSidebar} />
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
    class="pane @container flex min-w-[350px] sm:mr-1"
    defaultSize={layout?.[1] ?? 85}
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
