<script lang="ts">
  import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { notificationStore } from "$lib/stores/notification.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { House, UserCircle } from "@lucide/svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Resizable from "$lib/components/ui/resizable";
  import Sidebar from "$lib/components/sidebar.svelte";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import ContentContextMenu from "$lib/components/content/content-context-menu.svelte";
  import "../app.css";

  import { COLLAPSED_SIDEBAR_SIZE } from "$lib/constants/layout";
  import type { Snapshot } from "./$types.js";
  import SideDrawer from "$lib/components/side-drawer.svelte";
  import { getContentState, setContentState } from "$lib/state/content.svelte";
  import { setMediaQueryState } from "$lib/state/media-query.svelte";
  import {
    getPlaylistState,
    setPlaylistState,
  } from "$lib/state/playlist.svelte";
  import { setPageState, type ScrollPosition } from "$lib/state/page.svelte";
  import { setLayoutState } from "$lib/state/layout.svelte";

  // Initialize all state contexts
  const layoutState = setLayoutState();
  const pageState = setPageState();
  setContentState(pageState);
  setPlaylistState(pageState);

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

  let playlistsState = $derived(playlists);
  const contentState = getContentState();
  const playlistState = getPlaylistState();

  // Get current playlist context for the context menu
  // This will be set by individual content components
  const currentPlaylist = $derived(playlistState.currentPlaylist);

  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // Handle dragover for auto-scrolling
  function handleDragOver(e: DragEvent) {
    pageState.handleDragOver(e, contentState.dragContentType);
  }

  // Handle drag end - clean up all scrolling
  function handleDragEnd() {
    contentState.dragContentType = null;
    pageState.handleDragEnd();
  }

  function handleDrop() {
    contentState.dragContentType = null;
    pageState.handleDrop();
  }

  // Default snapshot for every page - restores scroll position when navigating through history
  export const snapshot: Snapshot<{
    content: ScrollPosition;
  }> = {
    capture: () => {
      return {
        content: pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef,
        ),
      };
    },
    restore: (positions) => {
      pageState.contentScrollPosition = positions.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        positions.content,
      );
    },
  };

  beforeNavigate(({ from }) => {
    if (from) {
      pageState.contentScrollPosition = pageState.createViewportSnapshot(
        pageState.viewportRefs.contentViewportRef,
      );
    }
  });

  afterNavigate(({ from, to, delta }) => {
    // Reset scroll state if new page
    if (!delta && from?.url.pathname !== to?.url.pathname) {
      if (pageState.viewportRefs.contentViewportRef) {
        pageState.viewportRefs.contentViewportRef.scrollTop = 0;
        pageState.viewportRefs.contentViewportRef.scrollLeft = 0;
      }
    }
  });

  $effect(() => {
    // Restore content viewport scroll
    pageState.restoreViewportScroll(
      pageState.viewportRefs.contentViewportRef,
      pageState.contentScrollPosition,
    );
    if (pageState.contentScrollPosition) {
      pageState.contentScrollPosition = null;
    }

    // Restore sidebar viewport scroll
    pageState.restoreViewportScroll(
      pageState.viewportRefs.sidebarViewportRef,
      pageState.sidebarScrollPosition,
    );
    if (pageState.sidebarScrollPosition) {
      pageState.sidebarScrollPosition = null;
    }
  });

  onMount(() => {
    // Set up event listeners for drag operations
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDrop);

    // Set up streaming notifications
    let streamingUnsubscribe: (() => void) | null = null;
    layoutState.setupStreamingNotifications().then((unsubscribe) => {
      streamingUnsubscribe = unsubscribe;
    });

    // Set up regular notifications
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

    // Set up auth notifications
    const authUnsubscribe = layoutState.setupNotifications(supabase);

    return () => {
      // Clean up event listeners
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDrop);

      // Clean up page state intervals
      pageState.cleanup();

      // Clean up subscriptions
      authUnsubscribe();
      notificationStoreUnsubscribe();
      if (streamingUnsubscribe) {
        streamingUnsubscribe();
      }
    };
  });
</script>

<Toaster position="bottom-center" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<!-- Global Content Context Menu -->
<div class="flex flex-col h-full">
  <nav class="flex items-center p-1 m-2 relative">
    <div class="flex items-center">
      <div class="sm:hidden w-full">
        <SideDrawer
          {playlists}
          {supabase}
          {session}
          handleLogout={() => layoutState.handleLogout(supabase)}
        />
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
        oninput={(e) => layoutState.handleSearch(e)}
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
                onclick={() => goto("/account")}
              >
                Account
              </DropdownMenu.Item>
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() => layoutState.handleLogout(supabase)}
              >
                Log out
              </DropdownMenu.Item>
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
    onLayoutChange={layoutState.onLayoutChange}
  >
    <Resizable.Pane
      defaultSize={layout ? parseFloat(layout[0]) : 15}
      minSize={12}
      maxSize={50}
      collapsedSize={COLLAPSED_SIDEBAR_SIZE}
      collapsible={true}
      onCollapse={() => (isSidebarCollapsed = true)}
      onExpand={() => (isSidebarCollapsed = false)}
      class="@container pane sm:flex hidden flex-col h-full grow {isSidebarCollapsed
        ? 'max-w-[75px] min-w-[75px]'
        : 'min-w-[200px]'}"
    >
      <ScrollArea
        type="scroll"
        class="h-full grow"
        bind:viewportRef={pageState.viewportRefs.sidebarViewportRef}
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
      onDraggingChange={layoutState.handleResize}
      class="bg-background w-2 end-[2px] after:transition after:duration-300 after:ease-out)] 
        after:h-[calc(100%-16px)] sm:flex hidden
        {layoutState.isDraggingDivider
        ? 'after:w-[1px] after:bg-foreground'
        : 'after:w-[1px] hover:after:bg-muted-foreground'}"
    />
    <Resizable.Pane
      class="@container pane flex min-w-[350px] sm:mr-2"
      defaultSize={layout ? parseFloat(layout[1]) : 79}
    >
      <ScrollArea
        type="scroll"
        orientation="vertical"
        class="w-full"
        bind:viewportRef={pageState.viewportRefs.contentViewportRef}
        data-scroll-area="content"
        ><ContentContextMenu
          playlist={currentPlaylist}
          {playlists}
          {supabase}
          {session}
        >
          <div class="flex flex-col relative justify-center items-center">
            <div class="@xl:max-w-[1450px] max-w-[1000px] w-full">
              <div class="flex flex-col mb-20">
                {@render children()}
              </div>
            </div>
          </div>
        </ContentContextMenu>
      </ScrollArea>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
