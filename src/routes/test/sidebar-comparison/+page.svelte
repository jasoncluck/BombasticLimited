<script lang="ts">
  import { onMount } from 'svelte';
  import * as Resizable from '$lib/components/ui/resizable';
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar.svelte';
  import SidebarItem from '$lib/components/sidebar/sidebar-item.svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { COLLAPSED_SIDEBAR_SIZE } from '$lib/constants/layout';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { getLayoutState } from '$lib/state/layout.svelte';
  import { Button } from '$lib/components/ui/button';

  // Get the current session and supabase instance from parent layout data
  let { data } = $props();
  let { session, supabase } = $derived(data);

  // Ensure we have valid session and supabase before rendering
  const isDataReady = $derived(session !== undefined && supabase !== undefined);

  const sidebarState = getSidebarState();
  const layoutState = getLayoutState();

  // Local state for toggling sidebar collapsed state
  let showCollapsedComparison = $state(false);
  let showExpandedComparison = $state(true);

  // Force sidebar to show real content for comparison
  let forceShowReal = $state(false);

  async function refreshSidebar() {
    try {
      await sidebarState.refreshData();
    } catch (error) {
      console.error('Error refreshing sidebar in test component:', error);
    }
  }

  // Toggle between showing skeleton vs real content
  function toggleContent() {
    forceShowReal = !forceShowReal;
  }

  onMount(() => {
    // Initialize sidebar state for testing
    sidebarState.initializeNonBlocking();
  });
</script>

<svelte:head>
  <title>Sidebar Comparison Test - Bombastic</title>
</svelte:head>

<div class="container mx-auto space-y-8 p-6">
  <div class="space-y-4 text-center">
    <h1 class="text-3xl font-bold">Sidebar Visual Comparison Test</h1>
    <p class="text-muted-foreground mx-auto max-w-2xl">
      This test component displays the skeleton sidebar and real sidebar side by
      side for visual comparison. Use this to identify and fix layout jump
      issues when transitioning from skeleton to real content.
    </p>
    {#if !isDataReady}
      <p class="text-yellow-600">Loading page data...</p>
    {/if}
  </div>

  <!-- Only show controls and content when data is ready -->
  {#if isDataReady}
    <!-- Controls -->
    <div class="flex flex-wrap justify-center gap-4">
      <Button
        variant={showExpandedComparison ? 'default' : 'outline'}
        onclick={() => (showExpandedComparison = !showExpandedComparison)}
      >
        {showExpandedComparison ? 'Hide' : 'Show'} Expanded Comparison
      </Button>
      <Button
        variant={showCollapsedComparison ? 'default' : 'outline'}
        onclick={() => (showCollapsedComparison = !showCollapsedComparison)}
      >
        {showCollapsedComparison ? 'Hide' : 'Show'} Collapsed Comparison
      </Button>
      <Button
        variant={forceShowReal ? 'default' : 'outline'}
        onclick={toggleContent}
      >
        {forceShowReal ? 'Show Skeleton' : 'Show Real Content'} (Right Side)
      </Button>
    </div>

    <!-- Expanded State Comparison -->
    {#if showExpandedComparison}
      <div class="space-y-4">
        <h2 class="text-center text-2xl font-semibold">
          Expanded Sidebar Comparison
        </h2>
        <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- Skeleton Sidebar (Expanded) -->
          <div class="space-y-2">
            <h3
              class="rounded bg-blue-50 p-2 text-center text-lg font-semibold text-blue-600"
            >
              Skeleton (Loading State)
            </h3>
            <div
              class="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-4"
            >
              <div class="relative h-[600px] w-[250px]">
                <ScrollArea type="scroll" class="h-full grow">
                  <div class="min-h-full">
                    <aside class="h-full overflow-hidden">
                      <!-- Sources Section Skeleton -->
                      <div class="mx-2 flex flex-col">
                        <!-- Fixed number of source items with exact heights -->
                        {#each Array(4)}
                          <SidebarItem
                            isLoading={true}
                            isSidebarCollapsed={false}
                          />
                        {/each}
                      </div>

                      <!-- Divider with exact spacing -->
                      <hr class="m-2" />

                      <!-- Playlists Header Section Skeleton with exact dimensions -->
                      <div class="m-3 mx-6 flex flex-col items-start">
                        <div class="flex h-[44px] items-center">
                          <!-- Full header with exact spacing matching real content structure -->
                          <Skeleton
                            class="my-1 h-9 w-9 flex-shrink-0 rounded-full"
                          />
                          <h2
                            class="ml-4 text-lg font-semibold tracking-tight opacity-50"
                          >
                            Playlists
                          </h2>
                        </div>
                      </div>

                      <!-- Playlists Container Skeleton with exact border and spacing -->
                      <div class="mx-2 rounded-md border-2 border-transparent">
                        <div class="flex flex-col">
                          <!-- Fixed number of playlist items -->
                          {#each Array(6), i}
                            <SidebarItem
                              isLoading={true}
                              isSidebarCollapsed={false}
                              showSpecialIcon={true}
                              iconIndex={i}
                              class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex w-full items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                            />
                          {/each}
                        </div>
                      </div>
                    </aside>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          <!-- Real Sidebar (Expanded) -->
          <div class="space-y-2">
            <h3
              class="rounded bg-green-50 p-2 text-center text-lg font-semibold text-green-600"
            >
              Real Content {forceShowReal ? '(Forced Real)' : '(Current State)'}
            </h3>
            <div
              class="rounded-lg border border-dashed border-green-300 bg-green-50/50 p-4"
            >
              <div class="relative h-[600px] w-[250px]">
                <ScrollArea type="scroll" class="h-full grow">
                  <div class="min-h-full">
                    {#if forceShowReal}
                      <!-- Force show real sidebar -->
                      <Sidebar
                        isSidebarCollapsed={false}
                        {supabase}
                        {session}
                        {refreshSidebar}
                      />
                    {:else}
                      <!-- Show current state (skeleton or real based on sidebarState) -->
                      {#if sidebarState.showPlaceholder}
                        <aside class="h-full overflow-hidden">
                          <!-- Same skeleton as left side -->
                          <div class="mx-2 flex flex-col">
                            {#each Array(4)}
                              <SidebarItem
                                isLoading={true}
                                isSidebarCollapsed={false}
                              />
                            {/each}
                          </div>
                          <hr class="m-2" />
                          <div class="m-3 mx-6 flex flex-col items-start">
                            <div class="flex h-[44px] items-center">
                              <Skeleton
                                class="my-1 h-9 w-9 flex-shrink-0 rounded-full"
                              />
                              <h2
                                class="ml-4 text-lg font-semibold tracking-tight opacity-50"
                              >
                                Playlists
                              </h2>
                            </div>
                          </div>
                          <div
                            class="mx-2 rounded-md border-2 border-transparent"
                          >
                            <div class="flex flex-col">
                              {#each Array(6), i}
                                <SidebarItem
                                  isLoading={true}
                                  isSidebarCollapsed={false}
                                  showSpecialIcon={true}
                                  iconIndex={i}
                                  class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex w-full items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                                />
                              {/each}
                            </div>
                          </div>
                        </aside>
                      {:else}
                        <Sidebar
                          isSidebarCollapsed={false}
                          {supabase}
                          {session}
                          {refreshSidebar}
                        />
                      {/if}
                    {/if}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Collapsed State Comparison -->
    {#if showCollapsedComparison}
      <div class="space-y-4">
        <h2 class="text-center text-2xl font-semibold">
          Collapsed Sidebar Comparison
        </h2>
        <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- Skeleton Sidebar (Collapsed) -->
          <div class="space-y-2">
            <h3
              class="rounded bg-blue-50 p-2 text-center text-lg font-semibold text-blue-600"
            >
              Skeleton (Loading State)
            </h3>
            <div
              class="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-4"
            >
              <div class="relative h-[600px] w-[75px]">
                <ScrollArea type="scroll" class="h-full grow">
                  <div class="min-h-full">
                    <aside class="h-full overflow-hidden">
                      <!-- Sources Section Skeleton -->
                      <div class="mx-1 flex flex-col">
                        <!-- Fixed number of source items with exact heights -->
                        {#each Array(4)}
                          <SidebarItem
                            isLoading={true}
                            isSidebarCollapsed={true}
                          />
                        {/each}
                      </div>

                      <!-- Divider with exact spacing -->
                      <hr class="m-2" />

                      <!-- Playlists Header Section Skeleton with exact dimensions -->
                      <div class="m-3 flex flex-col items-center">
                        <div class="flex h-[44px] items-center">
                          <!-- Collapsed header - centered circle -->
                          <Skeleton
                            class="my-1 h-9 w-9 flex-shrink-0 rounded-full"
                          />
                        </div>
                      </div>

                      <!-- Playlists Container Skeleton with exact border and spacing -->
                      <div class="mx-1 rounded-md border-2 border-transparent">
                        <div class="flex flex-col items-center">
                          <!-- Fixed number of playlist items -->
                          {#each Array(6), i}
                            <SidebarItem
                              isLoading={true}
                              isSidebarCollapsed={true}
                              showSpecialIcon={true}
                              iconIndex={i}
                              class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex w-12 items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                            />
                          {/each}
                        </div>
                      </div>
                    </aside>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          <!-- Real Sidebar (Collapsed) -->
          <div class="space-y-2">
            <h3
              class="rounded bg-green-50 p-2 text-center text-lg font-semibold text-green-600"
            >
              Real Content {forceShowReal ? '(Forced Real)' : '(Current State)'}
            </h3>
            <div
              class="rounded-lg border border-dashed border-green-300 bg-green-50/50 p-4"
            >
              <div class="relative h-[600px] w-[75px]">
                <ScrollArea type="scroll" class="h-full grow">
                  <div class="min-h-full">
                    {#if forceShowReal}
                      <!-- Force show real sidebar -->
                      <Sidebar
                        isSidebarCollapsed={true}
                        {supabase}
                        {session}
                        {refreshSidebar}
                      />
                    {:else}
                      <!-- Show current state (skeleton or real based on sidebarState) -->
                      {#if sidebarState.showPlaceholder}
                        <aside class="h-full overflow-hidden">
                          <!-- Same skeleton as left side -->
                          <div class="mx-1 flex flex-col">
                            {#each Array(4)}
                              <SidebarItem
                                isLoading={true}
                                isSidebarCollapsed={true}
                              />
                            {/each}
                          </div>
                          <hr class="m-2" />
                          <div class="m-3 flex flex-col items-center">
                            <div class="flex h-[44px] items-center">
                              <Skeleton
                                class="my-1 h-9 w-9 flex-shrink-0 rounded-full"
                              />
                            </div>
                          </div>
                          <div
                            class="mx-1 rounded-md border-2 border-transparent"
                          >
                            <div class="flex flex-col items-center">
                              {#each Array(6), i}
                                <SidebarItem
                                  isLoading={true}
                                  isSidebarCollapsed={true}
                                  showSpecialIcon={true}
                                  iconIndex={i}
                                  class="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground relative inline-flex w-12 items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                                />
                              {/each}
                            </div>
                          </div>
                        </aside>
                      {:else}
                        <Sidebar
                          isSidebarCollapsed={true}
                          {supabase}
                          {session}
                          {refreshSidebar}
                        />
                      {/if}
                    {/if}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Instructions -->
  <div class="mx-auto max-w-4xl space-y-4 text-center">
    <h2 class="text-xl font-semibold">How to Use This Test</h2>
    <div class="bg-muted space-y-2 rounded-lg p-4 text-left">
      <p>
        <strong>1. Visual Inspection:</strong> Compare the skeleton (blue) and real
        content (green) side by side.
      </p>
      <p>
        <strong>2. Spacing Check:</strong> Look for differences in padding, margins,
        and overall layout.
      </p>
      <p>
        <strong>3. Dimension Verification:</strong> Ensure button sizes, heights,
        and widths match exactly.
      </p>
      <p>
        <strong>4. State Testing:</strong> Toggle between collapsed and expanded
        states to check both.
      </p>
      <p>
        <strong>5. Content Toggle:</strong> Use the "Show Real Content" button to
        force real data on the right side.
      </p>
      <p>
        <strong>6. Layout Shifts:</strong> Any visible differences indicate potential
        layout jump issues.
      </p>
    </div>
  </div>
</div>
