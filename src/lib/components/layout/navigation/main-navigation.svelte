<script lang="ts">
  import { goto } from '$app/navigation';
  import { House } from '@lucide/svelte';
  import SideDrawer from '$lib/components/side-drawer.svelte';
  import SearchInput from './search-input.svelte';
  import UserMenu from './user-menu.svelte';
  import type { LayoutState } from '$lib/state/layout.svelte.js';
  import type { ContentState } from '$lib/state/content.svelte.js';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { UserProfile } from '$lib/supabase/user-profiles';

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
  <!-- Mobile Menu -->
  <div class="flex items-center">
    <div class="w-full sm:hidden">
      <SideDrawer
        {supabase}
        {session}
        handleLogout={() => layoutState.handleLogout(supabase)}
      />
    </div>
  </div>

  <!-- Center Section: Home Button + Search -->
  <div
    class="absolute top-1/2 left-1/2 flex -translate-x-[calc(50%-28px)] -translate-y-1/2 items-center"
  >
    <!-- Home Button (Desktop Only) -->
    <a
      href="/"
      data-testid="home-link"
      onclick={(e) => {
        e.preventDefault();
        searchQuery = '';
        goto('/');
      }}
      class="hover:text-primary mr-4 hidden text-sm font-medium transition-colors sm:block"
    >
      <House />
      <span class="sr-only">Home</span>
    </a>

    <!-- Search Input -->
    <SearchInput {layoutState} bind:searchQuery />
  </div>

  <!-- Right Section: User Controls -->
  <div class="ml-auto">
    <div class="ml-auto flex items-center gap-4 sm:flex">
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
