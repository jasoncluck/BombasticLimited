<script lang="ts">
  import { Bell } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Drawer from '$lib/components/ui/drawer';
  import { getNotificationState } from '$lib/state/notifications.svelte';
  import NotificationList from './notification-list.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { onMount } from 'svelte';

  let {
    supabase,
    openNotificationDrawer = $bindable(),
  }: {
    supabase: SupabaseClient<Database>;
    openNotificationDrawer?: boolean;
  } = $props();

  console.log(openNotificationDrawer);

  const mediaQueryState = getMediaQueryState();
  const { canHover } = $derived(mediaQueryState);

  const notificationState = getNotificationState();

  onMount(() => {
    if (supabase) {
      notificationState.initialize(supabase);
    }
  });

  // Auto-mark all notifications as read when bell menu opens
  async function handleMenuOpen() {
    if (notificationState.unreadCount > 0) {
      // Get all unread notification IDs
      const unreadIds = notificationState.notifications
        .filter((n) => !n.read)
        .map((n) => n.id);

      if (unreadIds.length > 0) {
        await notificationState.markAsRead(unreadIds);
      }
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
      class="relative cursor-pointer outline-none {buttonVariants({
        variant: 'ghost',
        size: 'icon',
      })}"
    >
      <Bell class="h-[1.2rem] w-[1.2rem]" />
      {#if notificationState.unreadCount > 0}
        <Badge
          variant="destructive"
          class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium"
        >
          {notificationState.unreadCount > 99
            ? '99+'
            : notificationState.unreadCount}
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
      {#if notificationState.unreadCount > 0}
        <Badge
          variant="destructive"
          class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium"
        >
          {notificationState.unreadCount > 99
            ? '99+'
            : notificationState.unreadCount}
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
