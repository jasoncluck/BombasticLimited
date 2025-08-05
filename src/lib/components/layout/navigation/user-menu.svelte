<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import * as Drawer from '$lib/components/ui/drawer/index.js';
  import * as Avatar from '$lib/components/ui/avatar';
  import {
    Cog,
    GalleryHorizontal,
    LogOut,
    Table,
    UserCircle,
  } from '@lucide/svelte';
  import { handleUpdateProfileContentDisplay } from '$lib/components/profile/profile-service';
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
    openAccountDrawer = $bindable(),
  }: {
    userProfile: UserProfile | null;
    session: Session | null;
    supabase: SupabaseClient<Database>;
    layoutState: LayoutState;
    contentState: ContentState;
    canHover: boolean;
    openAccountDrawer: boolean;
  } = $props();
</script>

{#if session}
  <!-- Content Display Preference (Desktop) -->
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      data-testid="user-preferences"
      id="user-preferences"
      class={buttonVariants({
        variant: 'outline',
        class: 'hidden cursor-pointer outline-none sm:block',
      })}
    >
      <div class="flex items-center gap-2">
        {#if userProfile?.content_display === 'TILES'}
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
            if (userProfile?.content_display !== 'TILES') {
              contentState.resetState();
              handleUpdateProfileContentDisplay({
                contentDisplay: 'TILES',
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
            if (userProfile?.content_display !== 'TABLE') {
              contentState.resetState();
              handleUpdateProfileContentDisplay({
                contentDisplay: 'TABLE',
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
  {#if canHover}
    <!-- Desktop User Menu -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="user-menu-trigger"
        class="cursor-pointer outline-none {buttonVariants({
          variant: 'outline',
          size: 'icon',
        })}"
      >
        {#if userProfile?.avatar_url}
          <Avatar.Root class="h-[1.2rem] w-[1.2rem]">
            <Avatar.Image src={userProfile.avatar_url} alt="User avatar" />
            <Avatar.Fallback>
              <UserCircle class="h-[1.2rem] w-[1.2rem]" />
            </Avatar.Fallback>
          </Avatar.Root>
        {:else}
          <UserCircle class="h-[1.2rem] w-[1.2rem]" />
        {/if}
        <span class="sr-only">Profile</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Group>
          <DropdownMenu.Item
            class="cursor-pointer"
            onclick={() => goto('/account')}
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
          variant: 'outline',
          size: 'icon',
          class: 'cursor-pointer',
        })}
      >
        {#if userProfile?.avatar_url}
          <Avatar.Root class="h-[1.2rem] w-[1.2rem]">
            <Avatar.Image src={userProfile.avatar_url} alt="User avatar" />
            <Avatar.Fallback>
              <UserCircle class="h-[1.2rem] w-[1.2rem]" />
            </Avatar.Fallback>
          </Avatar.Root>
        {:else}
          <UserCircle class="h-[1.2rem] w-[1.2rem]" />
        {/if}
        <span class="sr-only">Profile</span>
      </Drawer.Trigger>
      <Drawer.Content>
        <Button
          variant="ghost"
          class="drawer-button"
          onclick={() => {
            goto('/account');
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
              class: 'drawer-button-footer',
              variant: 'outline',
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
    onclick={() => goto('/auth/login')}
    variant="outline"
  >
    Login
  </Button>
{/if}
