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
    CircleUser,
    TriangleAlert,
  } from '@lucide/svelte';
  import NotificationBell from '$lib/components/notifications/notification-bell.svelte';
  import { handleUpdateProfileContentDisplay } from '$lib/components/profile/profile-service';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { getContentState } from '$lib/state/content.svelte';
  import { getNavigationState } from '$lib/state/navigation.svelte';

  let {
    userProfile,
    session,
    supabase,
    openAccountDrawer = $bindable(),
    openNotificationDrawer = $bindable(),
  }: {
    userProfile: UserProfile | null;
    session: Session | null;
    supabase: SupabaseClient<Database>;
    openAccountDrawer: boolean;
    openNotificationDrawer?: boolean;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const navigationState = getNavigationState();

  const {
    data: { userNotifications },
  } = $derived(navigationState);

  const { canHover, isSm } = $derived(mediaQueryState);
</script>

<!-- Content Display Preference (Desktop) -->
{#if session && isSm}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      data-testid="user-preferences"
      id="user-preferences"
      class={buttonVariants({
        variant: 'ghost',
        class: 'cursor-pointer outline-none',
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
{/if}

<!-- Notifications Bell -->
{#if session && userNotifications.length > 0}
  <NotificationBell {supabase} {session} bind:openNotificationDrawer />
{/if}

<!-- User Menu -->
{#if session}
  {#if canHover}
    <!-- Desktop User Menu -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="user-menu-trigger"
        class="cursor-pointer !rounded-full outline-none {buttonVariants({
          variant: userProfile?.avatar_url ? 'ghost' : 'outline',
          size: 'icon',
        })}"
      >
        {#if userProfile?.avatar_url}
          <Avatar.Root class="rounded-full">
            <Avatar.Image
              src={userProfile.avatar_url}
              alt="User avatar"
              class="h-full w-full rounded-full object-cover"
            />
            <Avatar.Fallback>
              <CircleUser class="h-[1.2rem] w-[1.2rem]" />
            </Avatar.Fallback>
          </Avatar.Root>
        {:else}
          <CircleUser class="h-[1.2rem] w-[1.2rem]" />
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
          <DropdownMenu.Item class="cursor-pointer">
            <a
              href="https://github.com/jasoncluck/Bombastic/issues/new?template=bug_report.md"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2 text-inherit no-underline"
            >
              <TriangleAlert />
              Report Bug
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="cursor-pointer"
            data-testid="logout-button"
            onclick={() => navigationState.handleLogout()}
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
        data-testid="user-menu-drawer-trigger"
        class="cursor-pointer !rounded-full outline-none {buttonVariants({
          variant: userProfile?.avatar_url ? 'ghost' : 'outline',
          size: 'icon',
        })}"
      >
        {#if userProfile?.avatar_url}
          <Avatar.Root class="rounded-full">
            <Avatar.Image
              src={userProfile.avatar_url}
              alt="User avatar"
              class="h-full w-full object-cover"
            />

            <Avatar.Fallback>
              <CircleUser class="h-[1.2rem] w-[1.2rem]" />
            </Avatar.Fallback>
          </Avatar.Root>
        {:else}
          <CircleUser class="h-[1.2rem] w-[1.2rem]" />
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
        <a
          href="https://github.com/jasoncluck/Bombastic/issues/new?template=bug_report.md"
          target="_blank"
          rel="noopener noreferrer"
          class="drawer-button text-inherit no-underline {buttonVariants({
            variant: 'ghost',
          })}"
          onclick={() => {
            openAccountDrawer = false;
          }}
        >
          <TriangleAlert />
          Report Bug
        </a>
        <Button
          variant="ghost"
          class="drawer-button"
          onclick={() => {
            navigationState.handleLogout();
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
    data-testid="nav-login-button"
    onclick={() => goto('/auth/login')}
    variant="outline"
  >
    Login
  </Button>
{/if}
