<script lang="ts">
  import {
    afterNavigate,
    beforeNavigate,
    goto,
    invalidate,
    invalidateAll,
  } from "$app/navigation";
  import { navigating } from "$app/state";
  import { browser } from "$app/environment";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { notificationStore } from "$lib/stores/notification.js";
  import { onMount, tick } from "svelte";
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
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";
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
  import Loader from "$lib/components/loader.svelte";
  import Sidebar from "$lib/components/sidebar/sidebar.svelte";
  import { setSidebarState } from "$lib/state/sidebar.svelte";
  import { setNavigationCacheState } from "$lib/state/navigation-cache";

  injectSpeedInsights();

  const layoutState = setLayoutState();
  const pageState = setPageState();
  const contentState = setContentState(pageState);
  const mediaQuery = setMediaQueryState();
  const navigationCache = setNavigationCacheState();

  let { data, children } = $props();
  let {
    session,
    supabase,
    layout,
    isSidebarCollapsed,
    userProfile,
    etag,
    lastModified,
    cached,
    cacheUserId,
  } = $derived(data);

  let sidebarState = setSidebarState();
  setPlaylistState(pageState, contentState, sidebarState);
  setSourceState(pageState);

  const shouldShowLoading = $derived(
    !mediaQuery.initialized || !sidebarState.initialized,
  );

  // Enhanced navigation loading state with preload awareness
  const isNavigatingToContent = $derived.by(() => {
    if (!navigating) return false;

    const from = navigating.from?.url;
    const to = navigating.to?.url;
    const user = session?.user;

    // Quick check with optimized navigation cache
    if (browser && navigationCache.initialized) {
      const shouldShow = navigationCache.shouldShowLoading(
        from?.href,
        to?.href,
        user?.id ?? null,
      );
      if (!shouldShow) return false;
    }

    return navigating.type === "goto" || navigating.type === "link";
  });

  let user = $derived(session?.user);
  let openAccountDrawer = $derived(sidebarState.openAccountDrawer);
  let searchQuery = $state(page.params.query);

  // Main navigation routes for preloading
  const mainRoutes = [
    { href: "/", label: "Home", icon: House },
    { href: "/giantbomb", label: "Giant Bomb" },
    { href: "/nextlander", label: "Nextlander" },
    { href: "/remap", label: "Remap" },
    { href: "/jeffgerstmann", label: "Jeff Gerstmann" },
  ];

  // Snapshot for scroll position restoration
  export const snapshot: Snapshot<{
    content: ScrollPosition;
    searchQuery?: string;
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

  async function refreshSidebar() {
    await sidebarState.refreshData();
  }

  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // Drag and drop handlers
  function handleDragOver(e: DragEvent) {
    pageState.handleDragOver(e, contentState.dragContentType);
  }

  function handleDragEnd() {
    contentState.dragContentType = null;
    pageState.handleDragEnd();
  }

  function handleDrop() {
    contentState.dragContentType = null;
    pageState.handleDrop();
  }

  // Preloading handlers
  function handleLinkHover(url: string) {
    // Preload on hover with high priority
    if (navigationCache.initialized) {
      navigationCache.onUserInteraction(url);
    }
  }

  function handleRoutePreload(currentPath: string) {
    if (!navigationCache.initialized) return;

    // Intelligent preloading based on current route
    if (currentPath === "/") {
      // Home page: preload main navigation routes
      navigationCache.preloadRoutes(
        ["/giantbomb", "/nextlander", "/remap", "/jeffgerstmann"],
        2,
      );

      // If user is authenticated, preload continue page
      if (user) {
        navigationCache.preloadRoute("/continue", 1);
      }
    } else if (currentPath === "/giantbomb") {
      navigationCache.preloadRoutes(
        ["/giantbomb?page=1", "/nextlander", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/nextlander") {
      navigationCache.preloadRoutes(
        ["/nextlander?page=1", "/giantbomb", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/remap") {
      navigationCache.preloadRoutes(
        ["/remap?page=1", "/giantbomb", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/jeffgerstmann") {
      navigationCache.preloadRoutes(
        ["/jeffgerstmann?page=1", "/giantbomb", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/continue" && user) {
      // Continue page: preload main routes
      navigationCache.preloadRoutes(["/giantbomb", "/nextlander"], 3);
    }
    // Add more intelligent preloading patterns as needed
  }

  // Optimized page data caching
  function cachePageData() {
    if (!browser || !navigationCache.initialized) return;

    const currentPath = window.location.pathname;
    const pageDataKey = `page:${currentPath}`;

    // Only cache if not already cached
    if (!navigationCache.getMemoryCache(pageDataKey)) {
      const pageData = {
        url: window.location.href,
        timestamp: Date.now(),
        userProfile,
        session: session ? { user: { id: session.user?.id } } : null,
        pathname: currentPath,
      };

      // Adjust TTL based on route type
      let ttl = 180000; // Default 3 minutes
      if (currentPath === "/")
        ttl = 120000; // Home: 2 minutes
      else if (currentPath === "/continue")
        ttl = 60000; // Continue: 1 minute (more dynamic)
      else if (mainRoutes.some((route) => route.href === currentPath))
        ttl = 300000; // Main routes: 5 minutes

      navigationCache.setMemoryCache(pageDataKey, pageData, ttl);
    }
  }

  beforeNavigate(({ from }) => {
    if (from) {
      pageState.contentScrollPosition = pageState.createViewportSnapshot(
        pageState.viewportRefs.contentViewportRef,
      );
    }
  });

  afterNavigate(async ({ from, to, delta }) => {
    // Reset scroll state if new page
    if (!delta && from?.url.pathname !== to?.url.pathname) {
      if (pageState.viewportRefs.contentViewportRef) {
        pageState.viewportRefs.contentViewportRef.scrollTop = 0;
        pageState.viewportRefs.contentViewportRef.scrollLeft = 0;
      }
    }

    await tick();

    // Clear search query when navigating away from search
    if (
      to &&
      !to.url.pathname.startsWith("/search/") &&
      to.url.pathname !== "/"
    ) {
      searchQuery = "";
    }

    // Invalidate video cache when leaving video pages
    if (from?.url.pathname.includes("/video")) {
      invalidate("supabase:db:videos");
    }

    // Store ETag information with security validation
    if (browser && to && etag && lastModified && !cached) {
      const currentUserId = user?.id ?? null;
      const currentCacheUserId = cacheUserId ?? null;

      // Validate user context for both authenticated and non-authenticated users
      if (currentUserId === currentCacheUserId) {
        navigationCache.setCacheEntry(
          to.url.href,
          etag,
          lastModified,
          currentUserId,
          currentCacheUserId,
        );
      } else {
        console.warn("User context mismatch, clearing cache");
        navigationCache.clearUserCache();
      }
    }

    // Cache page data after navigation
    cachePageData();

    // Trigger intelligent preloading after navigation settles
    if (to) {
      setTimeout(() => {
        handleRoutePreload(to.url.pathname);
      }, 500); // Small delay to let page settle
    }
  });

  // Scroll position restoration
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

  // Debug preload stats (remove in production)
  $effect(() => {
    if (browser && navigationCache.initialized) {
      const stats = navigationCache.getPreloadStats();
      if (stats.completed > 0 || stats.failed > 0) {
        console.log("📊 Preload stats:", {
          ...stats,
          cacheHitRate:
            (stats.completed / (stats.completed + stats.failed)) * 100,
        });
      }
    }
  });

  onMount(() => {
    let mediaQueryCleanup: (() => void) | undefined;
    let sidebarCleanup: (() => void) | undefined;
    let notificationStoreUnsubscribe: (() => void) | undefined;
    let authUnsubscribe: (() => void) | undefined;

    async function initialize() {
      await invalidateAll();

      // Initialize navigation cache first for best performance
      navigationCache.initialize();
      mediaQueryCleanup = mediaQuery.initialize();
      sidebarCleanup = await sidebarState.initialize();

      const currentUserId = user?.id ?? null;

      // Clear cache when user changes for security
      if (browser && navigationCache.currentUserId !== currentUserId) {
        navigationCache.clearUserCache();
      }

      // Store initial page ETag if available
      if (browser && etag && lastModified && !cached) {
        const currentCacheUserId = cacheUserId ?? null;

        if (currentUserId === currentCacheUserId) {
          navigationCache.setCacheEntry(
            window.location.href,
            etag,
            lastModified,
            currentUserId,
            currentCacheUserId,
          );
        }
      }

      // Start initial intelligent preloading
      if (browser) {
        setTimeout(() => {
          handleRoutePreload(window.location.pathname);
        }, 1000);
      }
    }

    initialize();

    // Event listeners for drag operations
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDrop);

    // Notification subscriptions
    notificationStoreUnsubscribe = notificationStore.subscribe((value) => {
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
    });

    authUnsubscribe = layoutState.setupNotifications(supabase);

    return () => {
      // Cleanup event listeners
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDrop);

      // Cleanup state
      pageState.cleanup();

      // Cleanup subscriptions
      if (authUnsubscribe) authUnsubscribe();
      if (notificationStoreUnsubscribe) notificationStoreUnsubscribe();
      layoutState.cleanup();

      // Cleanup state initializations
      if (mediaQueryCleanup) mediaQueryCleanup();
      if (sidebarCleanup) sidebarCleanup();
      navigationCache.cleanup();
    };
  });
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class="flex flex-col h-full">
  <!-- Main Navigation Bar -->
  <nav class="flex items-center p-1 m-2 relative" data-testid="main-navigation">
    <!-- Mobile Menu -->
    <div class="flex items-center">
      <div class="sm:hidden w-full">
        <SideDrawer
          {supabase}
          {session}
          handleLogout={() => layoutState.handleLogout(supabase)}
        />
      </div>
    </div>

    <!-- Center Section: Home Button + Search -->
    <div
      class="absolute left-1/2 top-1/2 -translate-x-[calc(50%-28px)] -translate-y-1/2 flex items-center"
    >
      <!-- Home Button (Desktop Only) -->
      <a
        href="/"
        data-testid="home-link"
        onmouseenter={() => handleLinkHover("/")}
        onclick={(e) => {
          e.preventDefault();
          searchQuery = "";
          goto("/");
        }}
        class="hidden sm:block text-sm font-medium transition-colors hover:text-primary mr-4"
      >
        <House />
        <span class="sr-only">Home</span>
      </a>

      <!-- Search Input -->
      <Input
        type="search"
        data-testid="search-input"
        oninput={(e) => layoutState.handleSearch(e)}
        placeholder="Search"
        class="sm:w-72 w-52"
        bind:value={searchQuery}
      />
      <Loader message="" size="sm" visible={layoutState.isSearching} />
    </div>

    <!-- Right Section: User Controls -->
    <div class="ml-auto">
      <div class="flex gap-4 items-center ml-auto sm:flex">
        {#if user}
          <!-- Content Display Preference (Desktop) -->
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              data-testid="user-preferences"
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

          <!-- User Menu -->
          {#if mediaQuery.canHover}
            <!-- Desktop User Menu -->
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                data-testid="user-menu-trigger"
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
                    onmouseenter={() => handleLinkHover("/account")}
                    onclick={() => goto("/account")}
                  >
                    <div class="flex items-center gap-2">
                      <Cog />
                      Settings
                    </div>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    class="cursor-pointer"
                    data-testid="logout-button"
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
            <!-- Mobile User Menu -->
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
          <!-- Login Button (Not Authenticated) -->
          <Button
            class="cursor-pointer"
            data-testid="login-button"
            onmouseenter={() => handleLinkHover("/auth/login")}
            onclick={() => goto("/auth/login")}
            variant="outline"
          >
            Login
          </Button>
        {/if}
      </div>
    </div>
  </nav>

  <!-- Main Content Area -->
  {#if shouldShowLoading}
    <!-- Initial Loading State -->
    <div class="w-full h-[calc(100dvh-60px)] flex items-center justify-center">
      <Loader size="lg" message="Loading..." />
    </div>
  {:else}
    <!-- Main Layout with Sidebar and Content -->
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
                  <!-- Navigation Loading Overlay -->
                  <div
                    class="absolute inset-0 z-[10000] bg-background/90 backdrop-blur-sm flex items-center justify-center transition-all duration-300"
                    class:opacity-100={isNavigatingToContent}
                    class:opacity-0={!isNavigatingToContent}
                    class:pointer-events-none={!isNavigatingToContent}
                    class:scale-100={isNavigatingToContent}
                    class:scale-95={!isNavigatingToContent}
                  >
                    <div class="flex flex-col items-center space-y-2">
                      <Loader size="lg" message="" />
                      <p class="text-sm text-muted-foreground">Loading...</p>
                    </div>
                  </div>

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
  {/if}
</div>
