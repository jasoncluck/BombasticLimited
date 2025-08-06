<script lang="ts">
  import { onMount } from 'svelte';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
  import Loader from '$lib/components/loader.svelte';
  import MainNavigation from '$lib/components/layout/navigation/main-navigation.svelte';
  import ResizableLayout from '$lib/components/layout/content/resizable-layout.svelte';
  import { useNavigation } from '$lib/components/layout/hooks/use-navigation.svelte.js';
  import { usePreloading } from '$lib/components/layout/hooks/use-preloading.svelte.js';
  import { useLayoutEffects } from '$lib/components/layout/hooks/use-layout-effects.svelte.js';
  import type { Snapshot } from './$types.js';
  import type { ScrollPosition } from '$lib/state/page.svelte.js';

  // Import all state dependencies
  import { setContentState } from '$lib/state/content.svelte';
  import { setMediaQueryState } from '$lib/state/media-query.svelte';
  import { setPlaylistState } from '$lib/state/playlist.svelte';
  import { setPageState } from '$lib/state/page.svelte';
  import { setLayoutState } from '$lib/state/layout.svelte';
  import { setSourceState } from '$lib/state/source.svelte';
  import { setSidebarState } from '$lib/state/sidebar.svelte';

  import '../app.css';
  import { setNavigationCacheState } from '$lib/state/navigation-cache/index.js';
  import { page } from '$app/stores';
  import { replaceState } from '$app/navigation';
  import { tabVisibility } from '$lib/utils/tab-visibility.js';

  injectSpeedInsights();

  // Dev-only mode fix for hot reloading
  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
      // Clear service worker caches on hot reload
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.controller?.postMessage({
          type: 'CLEAR_ALL_CACHES',
        });
      }
    });
  }

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

  // Initialize all state
  const layoutState = setLayoutState();
  const pageState = setPageState();
  const contentState = setContentState(pageState);
  const mediaQuery = setMediaQueryState();
  const navigationCache = setNavigationCacheState();
  const sidebarState = setSidebarState();

  setPlaylistState(pageState, contentState, sidebarState);
  setSourceState(pageState);

  let user = $derived(session?.user);
  let openAccountDrawer = $derived(sidebarState.openAccountDrawer);

  let lastUserState: boolean | null = null;
  let searchQuery = $state('');
  // Progressive loading states
  let isHydrated = $state(false);
  let forceShowUI = $state(false); // Development fallback

  // More granular loading states with development fallbacks
  const loadingStates = $derived.by(() => {
    const states = {
      mediaQuery: mediaQuery.initialized,
      sidebar: sidebarState.initialized,
      sidebarData: sidebarState.isDataLoaded,
      // Show UI as soon as we have basic functionality
      canShowBasicUI: isHydrated && mediaQuery.initialized,
      // Show full UI when everything is ready (but don't wait for sidebar data)
      canShowFullUI:
        isHydrated && mediaQuery.initialized && sidebarState.initialized,
    };
    
    // Development mode: Force show UI after timeout to prevent infinite loading
    if (import.meta.env.DEV && forceShowUI) {
      states.canShowBasicUI = true;
      states.canShowFullUI = true;
    }
    
    return states;
  });

  // Use custom hooks
  const preloading = usePreloading(navigationCache);
  const navigation = $derived(
    useNavigation(
      navigationCache,
      pageState,
      { value: searchQuery },
      etag,
      lastModified,
      cached,
      cacheUserId,
      user
    )
  );
  const layoutEffects = $derived(
    useLayoutEffects(
      pageState,
      contentState,
      navigationCache,
      mediaQuery,
      sidebarState,
      layoutState,
      supabase,
      session,
      etag,
      lastModified,
      cached,
      cacheUserId,
      preloading.startInitialPreloading
    )
  );

  // Create the derived state here in the component context
  const isNavigatingToContent = $derived(navigation.getIsNavigatingToContent());

  // Snapshot for scroll position restoration - MUST be in +layout.svelte
  export const snapshot: Snapshot<{
    content: ScrollPosition;
    searchQuery: string;
  }> = {
    capture: () => {
      return {
        content: pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef
        ),
        searchQuery,
      };
    },
    restore: (restored) => {
      pageState.contentScrollPosition = restored.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        restored.content
      );
      searchQuery = restored.searchQuery;
    },
  };

  async function refreshSidebar() {
    await sidebarState.refreshData();
  }

  // Reset drag state
  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // Setup navigation hooks
  $effect(() => {
    navigation.setupNavigationHooks(userProfile, session);
  });

  // Single effect to handle auth state changes
  $effect(() => {
    if (navigationCache && navigationCache.initialized) {
      const isCurrentlyAuthenticated = !!user;

      console.log('Layout effect - user object:', user ? 'present' : 'null');
      console.log(
        'Layout effect - isCurrentlyAuthenticated:',
        isCurrentlyAuthenticated
      );
      console.log('Layout effect - lastUserState:', lastUserState);

      // Only update auth status if state actually changed
      if (lastUserState !== isCurrentlyAuthenticated) {
        console.log(
          `Layout: Auth state changed from ${lastUserState} to ${isCurrentlyAuthenticated}`
        );

        navigationCache.updateAuthStatus();
        lastUserState = isCurrentlyAuthenticated;
      } else {
        console.log('Layout: Auth state unchanged, skipping update');
      }
    }
  });

  // Handle logout parameter (for account deletion)
  $effect(() => {
    if (
      typeof window !== 'undefined' &&
      $page.url.searchParams.get('logout') === 'true'
    ) {
      // Clear the URL parameter using SvelteKit's replaceState
      const url = new URL(window.location.href);
      url.searchParams.delete('logout');
      replaceState(url.toString(), {});

      // Force a full page reload to clear any cached auth state
      window.location.reload();
    }
  });

  // Development mode: Monitor loading states and force UI if stuck
  if (import.meta.env.DEV) {
    $effect(() => {
      // Only monitor after hydration starts
      if (!isHydrated) return;

      const checkStates = () => {
        const states = {
          isHydrated,
          mediaQuery: mediaQuery.initialized,
          sidebar: sidebarState.initialized,
          canShowBasicUI: loadingStates.canShowBasicUI,
          canShowFullUI: loadingStates.canShowFullUI,
        };
        
        console.log('🔍 Loading state check:', states);
        
        // Force UI if we're stuck in any loading state for too long
        if (isHydrated && (!loadingStates.canShowBasicUI || !loadingStates.canShowFullUI)) {
          console.warn('⚠️ Loading states seem stuck, will force UI soon...');
        }
      };

      // Check states periodically in development
      const interval = setInterval(checkStates, 2000);
      
      return () => {
        clearInterval(interval);
      };
    });
  }
  onMount(() => {
    // Mark as hydrated immediately
    isHydrated = true;

    // Development mode: Add timeout fallback to prevent infinite loading
    let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
    if (import.meta.env.DEV) {
      fallbackTimeout = setTimeout(() => {
        console.warn('🚨 Layout loading timeout - forcing UI to show (development mode)');
        console.log('Current loading states:', {
          isHydrated,
          mediaQuery: mediaQuery.initialized,
          sidebar: sidebarState.initialized,
          sidebarData: sidebarState.isDataLoaded,
        });
        forceShowUI = true;
      }, 5000); // 5 second timeout in development
    }

    // Track initialization progress for debugging
    if (import.meta.env.DEV) {
      console.log('🔄 Layout initialization starting...');
      console.log('Initial states:', {
        isHydrated,
        mediaQuery: mediaQuery.initialized,
        sidebar: sidebarState.initialized,
      });
    }

    // Initialize media queries immediately (fast, synchronous)
    const mediaCleanup = mediaQuery.initialize();
    
    if (import.meta.env.DEV) {
      console.log('✅ Media query initialized:', mediaQuery.initialized);
    }

    // Initialize sidebar non-blocking (fast UI, loads data in background)
    const sidebarCleanup = sidebarState.initializeNonBlocking();
    
    if (import.meta.env.DEV) {
      console.log('✅ Sidebar initialized:', sidebarState.initialized);
    }

    // Initialize layout effects asynchronously
    let layoutCleanup: (() => void) | undefined;

    // Handle the promise properly
    layoutEffects
      .initializeLayout()
      .then((cleanup) => {
        layoutCleanup = cleanup;
        if (import.meta.env.DEV) {
          console.log('✅ Layout effects initialized');
          // Clear the fallback timeout since we're now ready
          if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
            fallbackTimeout = undefined;
          }
        }
      })
      .catch((error) => {
        console.error('❌ Failed to initialize layout effects:', error);
        // In development, still show UI even if layout effects fail
        if (import.meta.env.DEV) {
          console.warn('Forcing UI to show despite layout effects failure');
          forceShowUI = true;
          if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
            fallbackTimeout = undefined;
          }
        }
      });

    // Add simple debug helpers in development (optional)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).cacheDebug = {
        updateAuth: () => navigationCache.updateAuthStatus(),
        stats: () => navigationCache.getPreloadStats(),
        clearCache: () => {
          if (
            'serviceWorker' in navigator &&
            navigator.serviceWorker.controller
          ) {
            navigator.serviceWorker.controller.postMessage({
              type: 'CLEAR_CACHE',
            });
          }
        },
        // Add new debug helpers for loading states
        loadingStates: () => ({
          isHydrated,
          forceShowUI,
          ...loadingStates,
        }),
        forceShowUI: () => {
          console.log('🔧 Manually forcing UI to show');
          forceShowUI = true;
        },
      };
      console.log('🔧 Cache debug tools available at window.cacheDebug');
      console.log('🔧 Use window.cacheDebug.forceShowUI() to manually show UI');
      console.log('🔧 Use window.cacheDebug.loadingStates() to check states');
    }

    // Setup service worker message handling for tab visibility
    if ('serviceWorker' in navigator) {
      const handleServiceWorkerMessage = (event: MessageEvent) => {
        const { type } = event.data || {};

        if (type === 'REQUEST_TAB_VISIBILITY') {
          // Respond with current tab visibility state
          event.ports[0]?.postMessage({
            type: 'TAB_VISIBILITY_RESPONSE',
            isVisible: tabVisibility.isVisible,
          });
        } else if (type === 'REQUEST_AUTH_STATE') {
          // Respond with current auth state
          event.ports[0]?.postMessage({
            type: 'AUTH_STATE_RESPONSE',
            isAuthenticated: !!user,
          });
        }
      };

      navigator.serviceWorker.addEventListener(
        'message',
        handleServiceWorkerMessage
      );

      // Cleanup service worker listener
      const cleanupServiceWorker = () => {
        navigator.serviceWorker.removeEventListener(
          'message',
          handleServiceWorkerMessage
        );
      };

      // Add to cleanup list
      return () => {
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
        }
        if (mediaCleanup && typeof mediaCleanup === 'function') {
          mediaCleanup();
        }
        if (sidebarCleanup && typeof sidebarCleanup === 'function') {
          sidebarCleanup();
        }
        if (layoutCleanup && typeof layoutCleanup === 'function') {
          layoutCleanup();
        }
        cleanupServiceWorker();
      };
    }

    // Return cleanup function for non-service worker case
    return () => {
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
      }
      if (mediaCleanup && typeof mediaCleanup === 'function') {
        mediaCleanup();
      }
      if (sidebarCleanup && typeof sidebarCleanup === 'function') {
        sidebarCleanup();
      }
      if (layoutCleanup && typeof layoutCleanup === 'function') {
        layoutCleanup();
      }
    };
  });
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class="flex h-full flex-col">
  <!-- Main Navigation Bar - Show immediately with fallbacks -->
  <MainNavigation
    {userProfile}
    {session}
    {supabase}
    {layoutState}
    {contentState}
    canHover={loadingStates.mediaQuery ? mediaQuery.canHover : true}
    bind:searchQuery
    bind:openAccountDrawer
  />

  <!-- Main Content Area with Progressive Loading -->
  {#if !isHydrated}
    <!-- SSR/Initial Load State -->
    <div class="flex h-[calc(100dvh-60px)] w-full items-center justify-center">
      <Loader size="lg" message="Initializing..." />
    </div>
  {:else if !loadingStates.canShowBasicUI}
    <!-- Basic hydration but waiting for media queries -->
    <div class="flex h-[calc(100dvh-60px)] w-full items-center justify-center">
      <Loader size="lg" message="Setting up interface..." />
      {#if import.meta.env.DEV}
        <div class="absolute bottom-4 text-xs text-gray-500">
          Debug: mediaQuery={mediaQuery.initialized}, hydrated={isHydrated}
        </div>
      {/if}
    </div>
  {:else if !loadingStates.canShowFullUI}
    <!-- Show minimal UI while sidebar initializes -->
    <div class="flex h-[calc(100dvh-60px)] w-full items-center justify-center">
      <Loader size="md" message="Almost ready..." />
      {#if import.meta.env.DEV}
        <div class="absolute bottom-4 text-xs text-gray-500">
          Debug: sidebar={sidebarState.initialized}, loading={sidebarState.loading}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Full UI - sidebar may still be loading data -->
    <ResizableLayout
      {layout}
      bind:isSidebarCollapsed
      {supabase}
      {session}
      {refreshSidebar}
      {pageState}
      {layoutState}
      {isNavigatingToContent}
    >
      {@render children()}
    </ResizableLayout>
  {/if}
</div>
