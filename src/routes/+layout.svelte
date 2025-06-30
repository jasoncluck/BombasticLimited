<script lang="ts">
  import {
    afterNavigate,
    beforeNavigate,
    goto,
    invalidate,
  } from "$app/navigation";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import {
    notificationStore,
    showNotification,
  } from "$lib/stores/notification.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import debounce from "debounce";
  import { page } from "$app/state";
  import { House, UserCircle } from "@lucide/svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Resizable from "$lib/components/ui/resizable";
  import Sidebar from "$lib/components/sidebar.svelte";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import "../app.css";
  import { source } from "sveltekit-sse";
  import { isSourceArray, SOURCE_INFO } from "$lib/constants/source";

  import { activeStreams } from "$lib/state/streaming.svelte";
  import { COLLAPSED_SIDEBAR_SIZE } from "$lib/constants/layout";
  import {
    createViewportSnapshot,
    pageState,
    restoreViewportScroll,
    type ScrollPosition,
    type ScrollState,
  } from "$lib/state/page.svelte";
  import type { Snapshot } from "./$types.js";
  import SideDrawer from "$lib/components/side-drawer.svelte";
  import { getContentState, setContentState } from "$lib/state/content.svelte";
  import { setMediaQueryState } from "$lib/state/media-query.svelte";

  const SEARCH_DEBOUNCE_MS = 500;

  setContentState();

  const mediaQuery = setMediaQueryState({
    // breakpoints: ["max-sm"],
    // customQueries: {
    //   hover: "(hover: hover)",
    //   "reduced-motion": "(prefers-reduced-motion: reduce)",
    // },
  });

  onMount(() => {
    return mediaQuery.initialize();
  });

  let { data, children } = $props();
  let { session, supabase, playlists, user, layout, isSidebarCollapsed } =
    $derived(data);

  let isDraggingDivider = $state(false);
  let currentDebouncedSearch: ReturnType<typeof debounce> | null = null;
  const streamingSources = source("/api/twitch").select(
    "streamingSubscriptions",
  );

  let playlistsState = $derived(playlists);
  const contentState = getContentState();

  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // Viewport references
  let sidebarViewportRef = $state<HTMLElement | null>(null);
  let contentViewportRef = $state<HTMLElement | null>(null);

  // Config
  const scrollSpeed = 10; // pixels per frame
  const scrollZoneSize = 50; // height of invisible areas in pixels

  // Function to start auto-scrolling for a specific viewport
  function startAutoScroll(
    viewportRef: HTMLElement | null,
    scrollState: ScrollState,
  ) {
    // Clear any existing interval first
    if (scrollState.interval !== null) {
      window.clearInterval(scrollState.interval);
    }

    if (viewportRef && scrollState.direction) {
      scrollState.scrolling = true;
      scrollState.interval = window.setInterval(() => {
        if (viewportRef && scrollState.direction) {
          if (scrollState.direction === "up") {
            viewportRef.scrollTop = Math.max(
              0,
              viewportRef.scrollTop - scrollSpeed,
            );
          } else if (scrollState.direction === "down") {
            viewportRef.scrollTop += scrollSpeed;
          }

          // If this is the content viewport, update pageInfo
          if (viewportRef === contentViewportRef) {
            pageState.contentScrollPosition = {
              scrollTop: viewportRef.scrollTop,
              scrollLeft: viewportRef.scrollLeft,
            };
          }
        }
      }, 16); // ~60fps
    }
  }

  // Function to stop auto-scrolling for a specific viewport
  function stopAutoScroll(scrollState: ScrollState) {
    if (scrollState.interval !== null) {
      window.clearInterval(scrollState.interval);
      scrollState.interval = null;
      scrollState.direction = null;
      scrollState.scrolling = false;
    }
  }

  // Handle dragover for auto-scrolling - specific to each viewport
  function handleDragOver(e: DragEvent) {
    if (!contentState.dragContentType) return;
    e.preventDefault(); // Allow drop

    // Check if we're over the sidebar viewport
    if (sidebarViewportRef && sidebarViewportRef.contains(e.target as Node)) {
      handleViewportDragOver(
        e,
        sidebarViewportRef,
        pageState.sidebarScrollState,
      );
    }

    if (contentViewportRef && contentViewportRef.contains(e.target as Node)) {
      handleViewportDragOver(
        e,
        contentViewportRef,
        pageState.contentScrollState,
      );
    }
  }

  // Generic handler for viewport drag over
  function handleViewportDragOver(
    e: DragEvent,
    viewportRef: HTMLElement,
    scrollState: ScrollState,
  ) {
    // Get the bounding rect of the scroll container
    const rect = viewportRef.getBoundingClientRect();
    const mouseY = e.clientY;

    // Check if mouse is in top scroll zone
    if (mouseY - rect.top < scrollZoneSize) {
      if (scrollState.direction !== "up") {
        scrollState.direction = "up";
        startAutoScroll(viewportRef, scrollState);
      }
    }
    // Check if mouse is in bottom scroll zone
    else if (rect.bottom - mouseY < scrollZoneSize) {
      if (scrollState.direction !== "down") {
        scrollState.direction = "down";
        startAutoScroll(viewportRef, scrollState);
      }
    }
    // Mouse is not in a scroll zone
    else if (scrollState.direction !== null) {
      stopAutoScroll(scrollState);
    }
  }

  // Handle drag end - clean up all scrolling
  function handleDragEnd() {
    contentState.dragContentType = null;
    stopAutoScroll(pageState.sidebarScrollState);
    stopAutoScroll(pageState.contentScrollState);
  }

  function handleDrop() {
    contentState.dragContentType = null;
    stopAutoScroll(pageState.sidebarScrollState);
    stopAutoScroll(pageState.contentScrollState);
  }

  // Default snapshot for every page - restores scroll position when navigating through history
  export const snapshot: Snapshot<{
    content: ScrollPosition;
  }> = {
    capture: () => {
      return {
        content: createViewportSnapshot(contentViewportRef),
      };
    },
    restore: (positions) => {
      pageState.contentScrollPosition = positions.content;

      restoreViewportScroll(contentViewportRef, positions.content);
    },
  };

  beforeNavigate(({ from }) => {
    if (from) {
      pageState.contentScrollPosition =
        createViewportSnapshot(contentViewportRef);
    }
  });

  afterNavigate(({ from, to, delta }) => {
    // Reset scroll state if new page
    if (!delta && from?.url.pathname !== to?.url.pathname) {
      if (contentViewportRef) {
        contentViewportRef.scrollTop = 0;
        contentViewportRef.scrollLeft = 0;
      }
    }
  });

  $effect(() => {
    // Restore content viewport scroll
    restoreViewportScroll(contentViewportRef, pageState.contentScrollPosition);
    if (pageState.contentScrollPosition) {
      pageState.contentScrollPosition = null;
    }

    // Restore sidebar viewport scroll
    restoreViewportScroll(sidebarViewportRef, pageState.sidebarScrollPosition);
    if (pageState.sidebarScrollPosition) {
      pageState.sidebarScrollPosition = null;
    }
  });

  onMount(() => {
    // Set up event listeners for drag operations
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDrop);

    // Flag for not displaying messages on initial page mount
    let initialMount = true;
    const streamSourcesUnsubscribe = streamingSources.subscribe(
      (latestStreamingSources) => {
        let latestStreamingSourcesParsed;

        try {
          // Attempt to parse the JSON
          latestStreamingSourcesParsed = JSON.parse(latestStreamingSources);
        } catch {
          return;
        }

        if (isSourceArray(latestStreamingSourcesParsed)) {
          const removedSources = activeStreams.sources.filter(
            (source) => !latestStreamingSourcesParsed.includes(source),
          );
          const addedSources = latestStreamingSourcesParsed.filter(
            (source) => !activeStreams.sources.includes(source),
          );

          if (!initialMount) {
            removedSources.forEach((removedSource) => {
              showNotification(
                `${SOURCE_INFO[removedSource].displayName} has ended their stream.`,
              );
            });

            addedSources.forEach((addedSource) => {
              showNotification(
                `${SOURCE_INFO[addedSource].displayName} has started streaming.`,
              );
            });
          }

          // Update the active streams
          activeStreams.sources = latestStreamingSourcesParsed;
        }
        initialMount = false;
      },
    );

    const notificationStoreUnsubscribe = notificationStore.subscribe(
      (value) => {
        if (value) {
          switch (value.type) {
            case "success":
              toast.success(value.message);
              break;
            case "warning":
              toast.warning(value.message);
              break;
            case "error":
              toast.error(value.message);
              break;
            default:
              toast(value.message);
          }
        }
      },
    );

    const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.expires_at !== session?.expires_at) {
        invalidate("supabase:auth");
      }
    });

    return () => {
      // Clean up event listeners
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDrop);

      // Clear any active intervals
      if (pageState.sidebarScrollState.interval !== null) {
        window.clearInterval(pageState.sidebarScrollState.interval);
      }
      if (pageState.contentScrollState.interval !== null) {
        window.clearInterval(pageState.contentScrollState.interval);
      }

      data.subscription.unsubscribe();
      streamSourcesUnsubscribe();
      notificationStoreUnsubscribe();
    };
  });

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    showNotification("Logged out.", "success");
    if (error) {
      console.error("Error signing out:", error);
    }
    window.location.reload();
  }

  async function searchRedirect(e: Event) {
    const input = e.target as HTMLInputElement;

    if (input.value === "") {
      await goto(`/`, { keepFocus: true });
    } else {
      goto(`/search/${encodeURIComponent(input.value)}`, {
        keepFocus: true,
      });
    }
    return e;
  }

  function handleSearch(e: Event) {
    if (currentDebouncedSearch?.isPending) {
      currentDebouncedSearch.clear();
    }

    (currentDebouncedSearch = debounce(
      () => searchRedirect(e),
      SEARCH_DEBOUNCE_MS,
    ))();
  }

  function handleResize(isDragging: boolean) {
    isDraggingDivider = isDragging;
  }

  function onLayoutChange(sizes: number[]) {
    document.cookie = `PaneForge:layout=${JSON.stringify(sizes)}; path=/; domain=${page.url.hostname}`;
  }
</script>

<Toaster position="bottom-center" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class="flex flex-col h-full">
  <nav class="flex items-center p-1 m-2 relative">
    <div class="flex items-center">
      <div class="sm:hidden w-full">
        <SideDrawer {playlists} {supabase} {session} {handleLogout} />
      </div>
    </div>

    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4"
    >
      <a
        href="/"
        class="hidden sm:block text-sm font-medium transition-colors hover:text-primary"
      >
        <House />
        <span class="sr-only">Home</span>
      </a>

      <Input
        oninput={handleSearch}
        placeholder="Search"
        class="sm:w-72"
        value={page.params.query}
      />
    </div>

    <div class="items-center ml-auto hidden sm:flex">
      {#if user}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="cursor-pointer outline-none {buttonVariants({
              variant: 'outline',
              size: 'icon',
            })}"
          >
            <UserCircle class="h-[1.2rem] w-[1.2rem]" />
            <span class="sr-only">Profile</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Group>
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() => goto("/account")}>Account</DropdownMenu.Item
              >
              <DropdownMenu.Item class="cursor-pointer" onclick={handleLogout}
                >Log out</DropdownMenu.Item
              >
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <Button
          class="cursor-pointer"
          onclick={() => goto("/auth/login")}
          variant="outline"
        >
          Login
        </Button>
      {/if}
    </div>
  </nav>

  <Resizable.PaneGroup
    direction="horizontal"
    class="h-full rounded-lg flex overflow-hidden"
    {onLayoutChange}
  >
    <!-- Size property of Pane has to be a percentage so classes are still used to set limits -->
    <Resizable.Pane
      defaultSize={layout ? parseFloat(layout[0]) : 15}
      minSize={12}
      maxSize={50}
      collapsedSize={COLLAPSED_SIDEBAR_SIZE}
      collapsible={true}
      onCollapse={() => (isSidebarCollapsed = true)}
      onExpand={() => (isSidebarCollapsed = false)}
      class="@container pane sm:flex hidden flex-col h-full grow  {isSidebarCollapsed
        ? 'max-w-[75px] min-w-[75px]'
        : 'min-w-[200px]'}"
    >
      <ScrollArea
        type="scroll"
        class="h-full grow"
        bind:viewportRef={sidebarViewportRef}
        data-scroll-area="sidebar"
      >
        <Sidebar
          {isSidebarCollapsed}
          bind:playlists={playlistsState}
          {supabase}
          {session}
        />
      </ScrollArea>
    </Resizable.Pane>
    <Resizable.Handle
      onDraggingChange={handleResize}
      class="bg-background w-2 end-[2px] after:transition after:duration-300 after:ease-out)] 
      after:h-[calc(100%-16px)] sm:flex hidden
    {isDraggingDivider
        ? 'after:w-[1px] after:bg-foreground'
        : 'after:w-[1px] hover:after:bg-muted-foreground'}"
    />
    <Resizable.Pane
      class="@container pane flex min-w-[350px] sm:mr-2 "
      defaultSize={layout ? parseFloat(layout[1]) : 79}
    >
      <ScrollArea
        type="scroll"
        orientation="vertical"
        class="w-full"
        bind:viewportRef={contentViewportRef}
        data-scroll-area="content"
      >
        <div class="flex flex-col relative justify-center items-center">
          <div class="@xl:max-w-[1450px] max-w-[1000px] w-full">
            <div class="flex flex-col mb-20">
              {@render children()}
            </div>
          </div>
        </div>
      </ScrollArea>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
