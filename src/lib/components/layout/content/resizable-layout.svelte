<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import Sidebar from "$lib/components/sidebar/sidebar.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { COLLAPSED_SIDEBAR_SIZE } from "$lib/constants/layout";
  import LoadingOverlay from "./loading-overlay.svelte";
  import type { PageState } from "$lib/state/page.svelte.js";
  import type { LayoutState } from "$lib/state/layout.svelte.js";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { Snippet } from "svelte";
  import { ListVideo } from "@lucide/svelte";
  import { getSidebarState } from "$lib/state/sidebar.svelte";

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
      {#if sidebarState.showPlaceholder}
        <!-- Sidebar Skeleton that mimics the actual sidebar structure -->
        <aside class="h-full overflow-hidden">
          <!-- Sources Section Skeleton -->
          <div class="flex flex-col {!isSidebarCollapsed ? 'mx-2' : 'mx-1'}">
            {#each Array(6)}
              <div
                class="flex items-center p-2 {!isSidebarCollapsed
                  ? 'h-14'
                  : 'h-14 justify-center'}"
              >
                {#if !isSidebarCollapsed}
                  <!-- Full width source item skeleton -->
                  <div class="flex items-center w-full space-x-3">
                    <Skeleton class="h-12 w-12 rounded" />
                    <Skeleton class="h-4 flex-1" />
                  </div>
                {:else}
                  <!-- Collapsed source item skeleton -->
                  <Skeleton class="h-12 w-12 rounded" />
                {/if}
              </div>
            {/each}
          </div>

          <!-- Divider -->
          <div class="mx-2 my-2">
            <Skeleton class="h-px w-full" />
          </div>

          <!-- Playlists Header Section Skeleton -->
          <div
            class="flex flex-col m-3 {!isSidebarCollapsed
              ? 'items-start mx-6'
              : 'items-center'}"
          >
            <div class="flex items-center h-[44px] w-full">
              {#if !isSidebarCollapsed}
                <!-- Full header with plus button and title -->
                <div class="flex items-center space-x-4">
                  <Skeleton class="h-10 w-10 rounded-full" />
                  <Skeleton class="h-6 w-20" />
                </div>
              {:else}
                <!-- Collapsed header with just plus button -->
                <Skeleton class="h-10 w-10 rounded-full" />
              {/if}
            </div>
          </div>

          <!-- Playlists Container Skeleton -->
          <div
            class="border-2 border-transparent rounded-md {!isSidebarCollapsed
              ? 'mx-2'
              : 'mx-1'}"
          >
            <div class="flex flex-col">
              {#each Array(4), i}
                <div
                  class="flex items-center p-2 {!isSidebarCollapsed
                    ? 'h-14'
                    : 'h-14 justify-center'}"
                >
                  {#if !isSidebarCollapsed}
                    <!-- Full width playlist item skeleton -->
                    <div class="flex items-center w-full space-x-3">
                      <div
                        class="h-12 w-12 flex-shrink-0 flex items-center justify-center"
                      >
                        <!-- Simulate either image or ListVideo icon -->
                        {#if i % 2 === 1}
                          <Skeleton class="h-12 w-12 rounded" />
                        {:else}
                          <div
                            class="h-12 w-12 flex items-center justify-center bg-muted rounded animate-pulse"
                          >
                            <ListVideo class="h-8 w-8 text-muted-foreground" />
                          </div>
                        {/if}
                      </div>
                      <Skeleton class="h-4 flex-1" />
                    </div>
                  {:else}
                    <!-- Collapsed playlist item skeleton -->
                    {#if i % 2 === 0}
                      <Skeleton class="h-12 w-12 rounded" />
                    {:else}
                      <div
                        class="h-12 w-12 flex items-center justify-center bg-muted rounded animate-pulse"
                      >
                        <ListVideo class="h-8 w-8 text-muted-foreground" />
                      </div>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </aside>
      {:else}
        <Sidebar {isSidebarCollapsed} {supabase} {session} {refreshSidebar} />
      {/if}
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
