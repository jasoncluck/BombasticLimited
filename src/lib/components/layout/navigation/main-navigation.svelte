<script lang="ts">
  import { page } from '$app/stores';
  import { House } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import SideDrawer from '$lib/components/side-drawer.svelte';
  import SearchInput from './search-input.svelte';
  import UserMenu from './user-menu.svelte';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import BrandLogo from '$lib/assets/brand-logo.svelte';
  import { getNavigationState } from '$lib/state/navigation.svelte';
  import Loader from '$lib/components/loader.svelte';

  let {
    userProfile,
    session,
    supabase,
    openAccountDrawer = $bindable(),
  }: {
    userProfile: UserProfile | null;
    session: Session | null;
    supabase: SupabaseClient<Database>;
    openAccountDrawer: boolean;
  } = $props();

  const navigationState = getNavigationState();

  // Sync navigation state with current context
  $effect(() => {
    navigationState.updateContext({
      session,
      userProfile,
      supabase,
    });
  });

  // Sync account drawer state
  $effect(() => {
    navigationState.openAccountDrawer = openAccountDrawer;
  });

  $effect(() => {
    openAccountDrawer = navigationState.openAccountDrawer;
  });

  // Update active route when page changes
  $effect(() => {
    if ($page?.url?.pathname) {
      navigationState.updateActiveRoute($page.url.pathname);
    }
  });

  // Get navigation items for easier access
  const homeNavItem = $derived(navigationState.getNavigationItem('home'));
  const brandLogoNavItem = $derived(
    navigationState.getNavigationItem('brand-logo')
  );
</script>

<nav class="relative flex items-center p-2" data-testid="main-navigation">
  <!-- Left Section: Mobile Menu + Brand Logo -->
  <div class="flex items-center">
    <!-- Mobile Menu -->
    <div class="sm:hidden">
      <SideDrawer
        {supabase}
        {session}
        handleLogout={() => navigationState.handleLogout()}
      />
    </div>

    <!-- Brand Logo -->
    {#if brandLogoNavItem && navigationState.config.enableBrandLogo}
      <a
        href={brandLogoNavItem.href}
        data-testid={brandLogoNavItem.testId}
        class={navigationState.getNavigationButtonClasses(
          brandLogoNavItem,
          'ml-2 hidden outline-hidden sm:ml-0 sm:block'
        )}
      >
        <BrandLogo />
        <span class="sr-only">{brandLogoNavItem.label}</span>
      </a>
    {/if}
  </div>

  <!-- Center Section: Home Button + Search Input -->
  <div
    class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3"
  >
    <!-- Home Button (Desktop Only) -->
    {#if homeNavItem && navigationState.config.enableHomeNavigation}
      <Button
        variant="outline"
        size="icon"
        class="hidden rounded-full hover:scale-105 sm:flex"
        href="/"
        data-testid={homeNavItem.testId}
        disabled={navigationState.isNavigating}
      >
        <House size={18} />
        <span class="sr-only">{homeNavItem.label}</span>
      </Button>
    {/if}

    <!-- Search Input -->
    <SearchInput />
    {#if navigationState.isSearching}
      <div class="absolute -right-11">
        <Loader message="" variant="block" />
      </div>
    {/if}
  </div>

  <!-- Right Section: User Controls -->
  <div class="ml-auto">
    <div class="flex items-center gap-2">
      <UserMenu
        {userProfile}
        {session}
        {supabase}
        bind:openAccountDrawer={navigationState.openAccountDrawer}
      />
    </div>
  </div>
</nav>
