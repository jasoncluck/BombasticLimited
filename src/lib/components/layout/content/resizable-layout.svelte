<script lang="ts">
  import * as Resizable from '$lib/components/ui/resizable';
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar.svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { COLLAPSED_SIDEBAR_SIZE } from '$lib/constants/layout';
  import LoadingOverlay from './loading-overlay.svelte';
  import type { PageState } from '$lib/state/page.svelte.js';
  import type { LayoutState } from '$lib/state/layout.svelte.js';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { Snippet } from 'svelte';
  import { ListVideo } from '@lucide/svelte';
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
</script>

<Resizable.PaneGroup
  direction="horizontal"
  class="flex h-full overflow-hidden rounded-lg"
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
                <div
                  class="flex items-center {!isSidebarCollapsed
                    ? 'h-[56px] px-2 py-1'
                    : 'h-[56px] justify-center px-1 py-1'}"
                >
                  {#if !isSidebarCollapsed}
                    <!-- Full width source item skeleton with exact spacing -->
                    <div class="flex w-full items-center space-x-3">
                      <Skeleton class="h-12 w-12 flex-shrink-0 rounded" />
                      <div class="min-w-0 flex-1">
                        <Skeleton class="h-4 w-full" />
                      </div>
                    </div>
                  {:else}
                    <!-- Collapsed source item skeleton -->
                    <Skeleton class="h-12 w-12 flex-shrink-0 rounded" />
                  {/if}
                </div>
              {/each}
            </div>

            <!-- HR element matching real sidebar exactly -->
            <hr class="m-2" />

            <!-- Playlists Header Section - exact match to real sidebar -->
            <div
              class="m-3 flex flex-col {!isSidebarCollapsed
                ? 'mx-6 items-start'
                : 'items-center'}"
            >
              <div class="flex h-[44px] items-center">
                {#if !isSidebarCollapsed}
                  <!-- Full header with exact spacing -->
                  <Skeleton class="my-1 h-10 w-10 flex-shrink-0 rounded-full" />
                  <h2
                    class="ml-4 text-lg font-semibold tracking-tight opacity-50"
                  >
                    Playlists
                  </h2>
                {:else}
                  <!-- Collapsed header - centered circle -->
                  <Skeleton class="my-1 h-10 w-10 flex-shrink-0 rounded-full" />
                {/if}
              </div>
            </div>

            <!-- Playlists Container Skeleton with exact border and spacing -->
            <div
              class="rounded-md border-2 border-transparent {!isSidebarCollapsed
                ? 'mx-2'
                : 'mx-1'}"
            >
              <div class="flex flex-col">
                <!-- Fixed number of playlist items with Button-like structure -->
                {#each Array(6), i}
                  <!-- Simulate Button component structure -->
                  <div
                    class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 {!isSidebarCollapsed
                      ? 'h-[56px] px-2 py-1'
                      : 'h-[56px] w-10 justify-center px-1 py-1'}"
                  >
                    <div
                      class="absolute flex grow items-center
                        {!isSidebarCollapsed ? 'w-full grow' : 'item-center'}"
                    >
                      {#if !isSidebarCollapsed}
                        <!-- Full width playlist item skeleton -->
                        <div class="flex w-full items-center space-x-3">
                          <div
                            class="flex h-12 w-12 flex-shrink-0 items-center justify-center"
                          >
                            <!-- Show ListVideo more frequently to match real behavior -->
                            {#if i % 3 === 0}
                              <Skeleton class="h-12 w-12 rounded" />
                            {:else}
                              <div
                                class="bg-muted flex h-12 w-12 animate-pulse items-center justify-center rounded"
                              >
                                <ListVideo
                                  class="text-muted-foreground h-8 w-8 opacity-50"
                                />
                              </div>
                            {/if}
                          </div>
                          <div class="min-w-0 flex-1">
                            <Skeleton class="h-4 w-full" />
                          </div>
                        </div>
                      {:else}
                        <!-- Collapsed playlist item skeleton -->
                        <div
                          class="flex h-12 w-12 flex-shrink-0 items-center justify-center"
                        >
                          {#if i % 3 === 0}
                            <Skeleton class="h-12 w-12 rounded" />
                          {:else}
                            <div
                              class="bg-muted flex h-12 w-12 animate-pulse items-center justify-center rounded"
                            >
                              <ListVideo
                                class="text-muted-foreground h-8 w-8 opacity-50"
                              />
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
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
