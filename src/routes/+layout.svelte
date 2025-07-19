<script lang="ts">
  import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { notificationStore } from "$lib/stores/notification.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import {
    Cog,
    GalleryHorizontal,
    House,
    LogOut,
    Table,
    UserCircle,
  } from "@lucide/svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as Resizable from "$lib/components/ui/resizable";
  import Sidebar from "$lib/components/sidebar.svelte";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import "../app.css";

  import { COLLAPSED_SIDEBAR_SIZE } from "$lib/constants/layout";
  import type { Snapshot } from "./$types.js";
  import SideDrawer from "$lib/components/side-drawer.svelte";
  import { setContentState } from "$lib/state/content.svelte";
  import { setMediaQueryState } from "$lib/state/media-query.svelte";
  import { setPlaylistState } from "$lib/state/playlist.svelte";
  import { setPageState, type ScrollPosition } from "$lib/state/page.svelte";
  import { setLayoutState } from "$lib/state/layout.svelte";
  import { handleUpdateProfileContentDisplay } from "$lib/components/profile/profile-service";
  import { setSourceState } from "$lib/state/source.svelte";

  // Initialize all state contexts
  const layoutState = setLayoutState();
  const pageState = setPageState();
  const contentState = setContentState(pageState);
  setPlaylistState(pageState, contentState);
  setSourceState(pageState);

  const mediaQuery = setMediaQueryState();

  onMount(() => {
    return mediaQuery.initialize();
  });

  let { data, children } = $props();
  let {
    userProfile,
    session,
    supabase,
    playlists,
    user,
    layout,
    isSidebarCollapsed,
  } = $derived(data);

  let openAccountDrawer = $state(false);

  let searchQuery = $state(page.params.query);

  let playlistsState = $derived(playlists);

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
    searchQuery: string;
  }> = {
    capture: () => {
      return {
        content: pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef,
        ),
        searchQuery,
      };
    },
    restore: (restored) => {
      pageState.contentScrollPosition = restored.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        restored.content,
      );

      searchQuery = restored.searchQuery;
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

  $effect(() => {
    if (!page.url.pathname.startsWith("/search/")) {
      console.log("in effect");
      searchQuery = "";
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

<Toaster position="top-right" />

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
          {userProfile}
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
        bind:value={searchQuery}
      />
    </div>

    <div class="ml-auto">
      <div class="flex gap-4 items-center ml-auto sm:flex">
        {#if user}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              id="user-preferences"
              class={buttonVariants({
                variant: "outline",
                class: "sm:block hidden cursor-pointer outline-none",
              })}
            >
              <div class="flex items-center gap-2">
                {#if userProfile?.content_display === "TILES"}
                  <div class="flex items-center gap-2">
                    <GalleryHorizontal />
                    Card
                  </div>
                {:else}
                  <div class="flex items-center gap-2">
                    <Table />
                    Table
                  </div>
                {/if}
              </div>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <DropdownMenu.Group>
                <DropdownMenu.Item
                  class="cursor-pointer"
                  onclick={() => {
                    if (userProfile?.content_display !== "TILES") {
                      contentState.resetState();
                      handleUpdateProfileContentDisplay({
                        contentDisplay: "TILES",
                        supabase,
                        session,
                      });
                    }
                  }}
                >
                  <div class="flex items-center gap-2">
                    <GalleryHorizontal />
                    Card
                  </div>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  class="cursor-pointer"
                  onclick={() => {
                    if (userProfile?.content_display !== "TABLE") {
                      contentState.resetState();

                      handleUpdateProfileContentDisplay({
                        contentDisplay: "TABLE",
                        supabase,
                        session,
                      });
                    }
                  }}
                >
                  <div class="flex items-center gap-2">
                    <Table />
                    Table
                  </div>
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          {#if mediaQuery.canHover}
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
                    <div class="flex items-center gap-2">
                      <Cog />
                    </div>
                    Settings
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    class="cursor-pointer"
                    onclick={() => layoutState.handleLogout(supabase)}
                  >
                    <div class="flex items-center gap-2">
                      <LogOut />
                      Log out
                    </div>
                  </DropdownMenu.Item>
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else}
            <Drawer.Root bind:open={openAccountDrawer}>
              <Drawer.Trigger
                class={buttonVariants({
                  variant: "outline",
                  size: "icon",
                  class: "cursor-pointer",
                })}
              >
                <UserCircle class="h-[1.2rem] w-[1.2rem]" />
                <span class="sr-only">Profile</span>
              </Drawer.Trigger>
              <Drawer.Content>
                <Button
                  variant="ghost"
                  class="drawer-button"
                  onclick={() => {
                    goto("/account");
                    openAccountDrawer = false;
                  }}
                >
                  <Cog />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  class="drawer-button"
                  onclick={() => {
                    layoutState.handleLogout(supabase);
                    openAccountDrawer = false;
                  }}
                >
                  <LogOut />
                  Log out
                </Button>
                <Drawer.Footer>
                  <Drawer.Close
                    class={buttonVariants({
                      class: "drawer-button-footer",
                      variant: "outline",
                    })}
                  >
                    Close
                  </Drawer.Close>
                </Drawer.Footer>
              </Drawer.Content>
            </Drawer.Root>
          {/if}
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
    </div>
  </nav>

  <Resizable.PaneGroup
    direction="horizontal"
    class="h-full rounded-lg flex overflow-hidden"
    onLayoutChange={layoutState.onLayoutChange}
  >
    <Resizable.Pane
      defaultSize={layout ? parseFloat(layout[0]) : 20}
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
        <Sidebar
          {isSidebarCollapsed}
          bind:playlists={playlistsState}
          {userProfile}
          {supabase}
          {session}
        />
      </ScrollArea>
    </Resizable.Pane>
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
    <Resizable.Pane
      class="@container pane flex min-w-[350px] sm:mr-1"
      defaultSize={layout ? parseFloat(layout[1]) : 79}
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
              {@render children()}
            </div>
          </div>
        </div>
      </ScrollArea>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
