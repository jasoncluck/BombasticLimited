<script lang="ts">
  import { goto } from '$app/navigation';
  import { House } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import SideDrawer from '$lib/components/side-drawer.svelte';
  import SearchInput from './search-input.svelte';
  import UserMenu from './user-menu.svelte';
  import type { LayoutState } from '$lib/state/layout.svelte.js';
  import type { ContentState } from '$lib/state/content.svelte.js';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import BrandLogo from '$lib/assets/brand-logo.svelte';

  let {
    userProfile,
    session,
    supabase,
    layoutState,
    contentState,
    canHover,
    searchQuery = $bindable(),
    openAccountDrawer = $bindable(),
  }: {
    userProfile: UserProfile | null;
    session: Session | null;
    supabase: SupabaseClient<Database>;
    layoutState: LayoutState;
    contentState: ContentState;
    canHover: boolean;
    searchQuery: string;
    openAccountDrawer: boolean;
  } = $props();
</script>

<nav class="relative m-2 flex items-center p-1" data-testid="main-navigation">
  <!-- Left Section: Mobile Menu + Brand Logo -->
  <div class="flex items-center">
    <!-- Mobile Menu -->
    <div class="sm:hidden">
      <SideDrawer
        {supabase}
        {session}
        handleLogout={() => layoutState.handleLogout(supabase)}
      />
    </div>

    <!-- Brand Logo -->
    <a
      href="/"
      data-testid="brand-logo-link"
      onclick={(e) => {
        e.preventDefault();
        searchQuery = '';
        goto('/', { replaceState: true });
      }}
      class="ml-2 transition-opacity duration-200 hover:opacity-80 sm:ml-0"
    >
      <BrandLogo class="h-8 w-auto" />
      <span class="sr-only">Bombastic Home</span>
    </a>
  </div>

  <!-- Center Section: Home Button + Search -->
  <div
    class="absolute top-1/2 left-1/2 flex -translate-x-[calc(50%-28px)] -translate-y-1/2 items-center gap-3"
  >
    <!-- Home Button (Desktop Only) - Now in circular button -->
    <Button
      variant="outline"
      size="icon"
      class="hidden rounded-full sm:flex"
      onclick={(e) => {
        e.preventDefault();
        searchQuery = '';
        goto('/', { replaceState: true });
      }}
      data-testid="home-link"
    >
      <House size={18} />
      <span class="sr-only">Home</span>
    </Button>

    <!-- Search Input -->
    <SearchInput {layoutState} bind:searchQuery />
  </div>

  <!-- Right Section: User Controls -->
  <div class="ml-auto">
    <div class="flex items-center gap-4">
      <UserMenu
        {userProfile}
        {session}
        {supabase}
        {layoutState}
        {contentState}
        {canHover}
        bind:openAccountDrawer
      />
    </div>
  </div>
</nav>
