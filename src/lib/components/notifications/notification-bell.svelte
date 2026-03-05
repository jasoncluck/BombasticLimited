<script lang="ts">
  import { Bell } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Drawer from '$lib/components/ui/drawer';
  import NotificationList from './notification-list.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { markAsRead } from '$lib/supabase/notifications';
  import { getNavigationState } from '$lib/state/navigation.svelte';

  let {
    supabase,
  }: {
    supabase: SupabaseClient<Database>;
  } = $props();

  const mediaQueryState = getMediaQueryState();
  const navigationState = getNavigationState();

  const {
    data: { userNotifications },
  } = $derived(navigationState);

  const { canHover } = $derived(mediaQueryState);

  const notificationIds = $derived(
    userNotifications.map((n) => n.notification_id) ?? []
  );
  const unreadNotifications = $derived(
    userNotifications.filter((n) => n.read === false) ?? []
  );

  // State to control drawer open/close
  let isDrawerOpen = $state(false);

  // Auto-mark all notifications as read when bell menu opens
  async function handleMenuOpen() {
    if (unreadNotifications) {
      await markAsRead({ notificationIds, supabase });
      navigationState.refreshData();
    }
  }

  // Function to close the drawer
  function closeDrawer() {
    isDrawerOpen = false;
  }
</script>

{#if canHover}
  <!-- Desktop Notification Dropdown -->
  <DropdownMenu.Root onOpenChange={(open) => open && handleMenuOpen()}>
    <DropdownMenu.Trigger
      data-testid="notification-bell"
      class={buttonVariants({
        variant: 'ghost',
        size: 'icon',
        class: 'ghost-button-minimal',
      })}
    >
      <Bell class="h-[1.2rem] w-[1.2rem]" />
      {#if unreadNotifications.length > 0}
        <Badge
          class="bg-primary absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-medium"
        >
          {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
        </Badge>
      {/if}
      <span class="sr-only">Notifications</span>
    </DropdownMenu.Trigger>

    <DropdownMenu.Content class="max-h-96 w-80 overflow-hidden p-0" align="end">
      <div class="flex items-center justify-between border-b px-4 py-2">
        <h4 class="font-semibold">Notifications</h4>
      </div>

      <div class="max-h-80 overflow-y-auto">
        <NotificationList {supabase} />
      </div>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <!-- Mobile Notification Drawer -->
  <Drawer.Root
    bind:open={isDrawerOpen}
    onOpenChange={(open) => open && handleMenuOpen()}
  >
    <Drawer.Trigger
      data-testid="notification-bell-mobile"
      class="relative cursor-pointer outline-hidden {buttonVariants({
        variant: 'ghost',
        size: 'icon',
      })}"
    >
      <Bell class="h-[1.2rem] w-[1.2rem]" />
      {#if unreadNotifications.length > 0}
        <Badge
          variant="destructive"
          class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium"
        >
          {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
        </Badge>
      {/if}
      <span class="sr-only">Notifications</span>
    </Drawer.Trigger>

    <Drawer.Content>
      <div class="mx-auto w-full max-w-sm">
        <div class="flex items-center justify-between p-4 pb-2">
          <Drawer.Title class="text-lg font-semibold"
            >Notifications</Drawer.Title
          >
        </div>

        <div class="max-h-96 overflow-y-auto px-4 pb-4">
          <NotificationList {supabase} onNotificationClick={closeDrawer} />
        </div>

        <Drawer.Footer>
          <Drawer.Close
            class={buttonVariants({
              variant: 'outline',
              class: 'w-full',
            })}
          >
            Close
          </Drawer.Close>
        </Drawer.Footer>
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
