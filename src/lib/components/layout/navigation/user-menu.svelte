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
  import BugReportDialog from '$lib/components/bug-report/bug-report-dialog.svelte';
  import BugReportDrawer from '$lib/components/bug-report/bug-report-drawer.svelte';
  import {
    getUserInitials,
    handleUpdateProfileContentDisplay,
  } from '$lib/components/profile/profile-service';
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
  }: {
    userProfile: UserProfile | null;
    session: Session | null;
    supabase: SupabaseClient<Database>;
    openAccountDrawer: boolean;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const navigationState = getNavigationState();

  const {
    data: { userNotifications },
  } = $derived(navigationState);

  const { canHover, isSm } = $derived(mediaQueryState);

  // Bug report dialog state
  let bugReportDialogOpen = $state(false);
  let bugReportDrawerOpen = $state(false);
</script>

<!-- Content Display Preference (Desktop) -->
{#if session && isSm}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      data-testid="user-preferences"
      id="user-preferences"
      class={buttonVariants({
        variant: 'ghost',
        size: 'icon',
        class: 'ghost-button-minimal',
      })}
    >
      <div class="flex items-center gap-2">
        {#if userProfile?.content_display === 'TILES'}
          <div class="flex items-center gap-2">
            <GalleryHorizontal />
          </div>
        {:else}
          <div class="flex items-center gap-2">
            <Table />
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
  <div class="relative">
    <NotificationBell {supabase} />
  </div>
{/if}

<!-- User Menu -->
{#if session}
  {#if canHover}
    <!-- Desktop User Menu -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="user-menu-trigger"
        class={buttonVariants({
          variant: userProfile?.avatar_url ? 'outline' : 'outline',
          size: 'icon',
          class:
            'outline-hiddden size-10 cursor-pointer !rounded-full hover:scale-105',
        })}
      >
        {#if userProfile}
          <Avatar.Root class="outline-hiddden size-10 rounded-full p-1.5">
            <Avatar.Image
              src={userProfile?.avatar_url}
              alt="User avatar"
              class=" rounded-full"
            />
            <Avatar.Fallback>
              {getUserInitials(userProfile.username)}</Avatar.Fallback
            >
          </Avatar.Root>
          <span class="sr-only">Profile</span>
        {/if}
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
            onclick={() => (bugReportDialogOpen = true)}
          >
            <div class="flex items-center gap-2">
              <TriangleAlert />
              Report Issue
            </div>
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
        class="outline-hiddden cursor-pointer !rounded-full {buttonVariants({
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
        <Button
          variant="ghost"
          class="drawer-button"
          onclick={() => {
            bugReportDrawerOpen = true;
            openAccountDrawer = false;
          }}
        >
          <TriangleAlert />
          Report Issue
        </Button>
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

<!-- Bug Report Dialog (Desktop) -->
<BugReportDialog bind:open={bugReportDialogOpen} {supabase} {session} />

<!-- Bug Report Drawer (Mobile) -->
<BugReportDrawer bind:open={bugReportDrawerOpen} {supabase} {session} />
