<script lang="ts">
  import { Bell } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Drawer from '$lib/components/ui/drawer';
  import NotificationList from './notification-list.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import {
    markAsRead,
    type NotificationWithMeta,
  } from '$lib/supabase/notifications';
  import { invalidate } from '$app/navigation';

  let {
    notifications,
    supabase,
    session,
    openNotificationDrawer = $bindable(),
  }: {
    notifications: NotificationWithMeta[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
    openNotificationDrawer?: boolean;
  } = $props();

  const mediaQueryState = getMediaQueryState();
  const { canHover } = $derived(mediaQueryState);

  const notificationIds = $derived(notifications.map((n) => n.id));
  const unreadNotifications = $derived(
    notifications.filter((n) => n.read === false)
  );

  // Auto-mark all notifications as read when bell menu opens
  async function handleMenuOpen() {
    if (unreadNotifications) {
      await markAsRead({ notificationIds, supabase, session });
      invalidate('supabase:db:notifications');
    }
  }

  // Close dropdown/drawer handler
  function handleClose() {
    if (openNotificationDrawer !== undefined) {
      openNotificationDrawer = false;
    }
  }
</script>

{#if canHover}
  <!-- Desktop Notification Dropdown -->
  <DropdownMenu.Root onOpenChange={(open) => open && handleMenuOpen()}>
    <DropdownMenu.Trigger
      data-testid="notification-bell"
      class="relative !cursor-pointer outline-none {buttonVariants({
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
    </DropdownMenu.Trigger>

    <DropdownMenu.Content class="max-h-96 w-80 overflow-hidden p-0" align="end">
      <div class="flex items-center justify-between border-b px-4 py-2">
        <h4 class="font-semibold">Notifications</h4>
      </div>

      <div class="max-h-80 overflow-y-auto">
        <NotificationList
          {supabase}
          {session}
          {notifications}
          onNotificationClick={handleClose}
          showActions={false}
          compact={true}
        />
      </div>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <!-- Mobile Notification Drawer -->
  <Drawer.Root
    bind:open={openNotificationDrawer}
    onOpenChange={(open) => open && handleMenuOpen()}
  >
    <Drawer.Trigger
      data-testid="notification-bell-mobile"
      class="relative cursor-pointer outline-none {buttonVariants({
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
          <NotificationList
            {supabase}
            {session}
            {notifications}
            onNotificationClick={handleClose}
            showActions={false}
            compact={true}
          />
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
