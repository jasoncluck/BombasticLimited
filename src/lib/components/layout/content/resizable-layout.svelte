<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import Sidebar from "$lib/components/sidebar/sidebar.svelte";
  import { COLLAPSED_SIDEBAR_SIZE } from "$lib/constants/layout";
  import LoadingOverlay from "./loading-overlay.svelte";
  import type { PageState } from "$lib/state/page.svelte.js";
  import type { LayoutState } from "$lib/state/layout.svelte.js";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { Snippet } from "svelte";

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
</script>

<Resizable.PaneGroup
  direction="horizontal"
  class="h-full rounded-lg flex overflow-hidden"
  onLayoutChange={layoutState.onLayoutChange}
>
  <!-- Sidebar Pane (Desktop Only) -->
  <Resizable.Pane
    defaultSize={layout?.[0] ?? 15}
    minSize={12}
    maxSize={50}
    collapsedSize={COLLAPSED_SIDEBAR_SIZE}
    collapsible={true}
    onCollapse={() => (isSidebarCollapsed = true)}
    onExpand={() => (isSidebarCollapsed = false)}
    class="@container pane sm:flex hidden flex-col h-full grow sm:ml-2 {isSidebarCollapsed
      ? 'max-w-[75px] min-w-[75px]'
      : 'min-w-[200px]'}"
  >
    <ScrollArea
      type="scroll"
      class="h-full grow"
      bind:viewportRef={pageState.viewportRefs.sidebarViewportRef}
      data-scroll-area="sidebar"
    >
      <Sidebar {isSidebarCollapsed} {supabase} {session} {refreshSidebar} />
    </ScrollArea>
  </Resizable.Pane>

  <!-- Resizable Handle -->
  <Resizable.Handle
    onDraggingChange={(isDragging) =>
      (layoutState.isDraggingDivider = isDragging)}
    draggable={true}
    class="bg-background w-1 end-[2px] after:transition after:duration-300 after:ease-out)] 
    after:h-[calc(100%-16px)] sm:flex sm:ml-1 hidden
    {layoutState.isDraggingDivider
      ? 'after:w-[1px] after:bg-foreground'
      : 'after:w-[1px] hover:after:bg-muted-foreground'}"
  />

  <!-- Main Content Pane -->
  <Resizable.Pane
    class="@container pane flex min-w-[350px] sm:mr-1"
    defaultSize={layout?.[1] ?? 85}
  >
    <ScrollArea
      type="scroll"
      orientation="vertical"
      class="w-full"
      bind:viewportRef={pageState.viewportRefs.contentViewportRef}
      data-scroll-area="content"
    >
      <div
        class="flex flex-col relative justify-center items-center m-2 sm:m-4"
      >
        <div class="@xl:max-w-[1450px] max-w-[1000px] w-full">
          <div class="flex flex-col mb-20">
            <div
              class="flex flex-col relative justify-center items-center m-2 sm:m-4"
            >
              <LoadingOverlay {isNavigatingToContent} />

              <!-- Page Content -->
              <div class="@xl:max-w-[1450px] max-w-[1000px] w-full">
                <div class="flex flex-col mb-20">
                  {@render children()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  </Resizable.Pane>
</Resizable.PaneGroup>
