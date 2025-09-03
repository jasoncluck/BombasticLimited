<script lang="ts">
  import * as Resizable from '$lib/components/ui/resizable';
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar.svelte';
  import Loader from '$lib/components/loader.svelte';
  import { COLLAPSED_SIDEBAR_SIZE } from '$lib/constants/layout';
  import LoadingOverlay from './loading-overlay.svelte';
  import { getPageState } from '$lib/state/page.svelte.js';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { Snippet } from 'svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { getContentState } from '$lib/state/content.svelte';
  let {
    supabase,
    session,
    refreshSidebar,
    isNavigatingToContent,
    children,
  }: {
    supabase: SupabaseClient<Database>;
    session: Session | null;
    refreshSidebar: () => Promise<void>;
    isNavigatingToContent: boolean;
    children: Snippet;
  } = $props();

  const pageState = getPageState();
  const sidebarState = getSidebarState();
  const mediaQueryState = getMediaQueryState();
  const contentState = getContentState();

  // Use the navigation state's sidebar collapsed state
  const isSidebarCollapsed = $derived(sidebarState.isSidebarCollapsed);

  // Effect to control scroll blocking when dropdown is open
  $effect(() => {
    const sidebarViewport = pageState.viewportRefs.sidebarViewportRef;
    const contentViewport = pageState.viewportRefs.contentViewportRef;

    if (
      contentState.isDropdownMenuOpen ||
      contentState.openContextMenuSection
    ) {
      // Block scrolling when dropdown is open
      if (sidebarViewport) {
        sidebarViewport.style.overflow = 'hidden';
      }
      if (contentViewport) {
        contentViewport.style.overflow = 'hidden';
      }
    } else {
      // Restore scrolling when dropdown is closed
      if (sidebarViewport) {
        sidebarViewport.style.overflow = 'auto';
      }
      if (contentViewport) {
        contentViewport.style.overflow = 'auto';
      }
    }
  });
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
    onCollapse={() => sidebarState.setSidebarCollapsed(true)}
    onExpand={() => sidebarState.setSidebarCollapsed(false)}
    class="pane @container hidden h-full grow flex-col sm:ml-2 sm:flex {isSidebarCollapsed
      ? 'max-w-[75px] min-w-[75px]'
      : 'min-w-[200px]'}"
  >
    <ScrollArea
      type="scroll"
      class="h-full grow overflow-hidden"
      bind:viewportRef={pageState.viewportRefs.sidebarViewportRef}
      data-scroll-area="sidebar"
    >
      <!-- Fixed height container to prevent layout shifts -->
      <div class="h-full">
        {#if sidebarState.showPlaceholder}
          <!-- Simple centered loader -->
          <div class="flex h-full items-center justify-center">
            <Loader variant="block" size="md" message="" />
          </div>
        {:else}
          <Sidebar {isSidebarCollapsed} {supabase} {session} {refreshSidebar} />
        {/if}
      </div>
    </ScrollArea>
  </Resizable.Pane>

  <!-- Resizable Handle -->
  <Resizable.Handle
    onDraggingChange={(isDragging) =>
      (sidebarState.isDraggingDivider = isDragging)}
    draggable={true}
    class="bg-background end-[2px] hidden w-1 after:h-[calc(100%-16px)] after:transition 
    after:duration-300 after:ease-out sm:ml-1 sm:flex
    {sidebarState.isDraggingDivider
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
        <div
          class="flex items-start justify-center sm:m-6 {mediaQueryState.canHover
            ? 'm-4'
            : 'm-2'}"
        >
          <div class="w-full max-w-[1000px] @xl:max-w-[1450px]">
            <div class="relative mb-20 flex flex-col">
              <LoadingOverlay {isNavigatingToContent} />
              {@render children()}
            </div>
          </div>
        </div>
      </div>
      <footer class="mt-20 px-4 pb-8 text-center">
        <div class="mx-auto max-w-4xl">
          <div class="border-t border-gray-200 pt-8 dark:border-gray-700">
            <nav class="mb-4 flex justify-center gap-8">
              <a
                href="/getting-started"
                class="text-muted-foreground text-xs hover:underline"
                >Documentation</a
              >
              <a
                href="mailto:jason@bombastic.ltd"
                class="text-muted-foreground text-xs hover:underline">Contact</a
              >
            </nav>
            <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Bombastic Limited is not affiliated with, endorsed by, or
              connected to any of the content creators featured on this website.
              All video content is the property of their respective owners and
              creators.
            </p>
          </div>
        </div>
      </footer>
    </ScrollArea>
  </Resizable.Pane>
</Resizable.PaneGroup>
