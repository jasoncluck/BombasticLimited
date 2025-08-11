<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import {
    Check,
    X,
    Trash2,
    ExternalLink,
    Bell,
    User,
    Play,
    AlertCircle,
    AtSign,
    LoaderIcon,
  } from '@lucide/svelte';
  import { getNotificationState } from '$lib/state/notifications.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type {
    NotificationWithMeta,
    NotificationType,
  } from '$lib/supabase/notifications';

  let {
    supabase,
    showActions = true,
    compact = false,
    filterType,
    onNotificationClick,
  }: {
    supabase: SupabaseClient<Database>;
    showActions?: boolean;
    compact?: boolean;
    filterType?: NotificationType;
    onNotificationClick?: () => void;
  } = $props();

  const notificationState = getNotificationState();

  // Load more notifications when scrolling near bottom
  let loadingMore = $state(false);

  // Initialize and load notifications - only run once when supabase or filterType changes
  let currentSupabase: SupabaseClient<Database> | null = null;
  let currentFilterType: NotificationType | undefined | null = null;

  $effect(() => {
    // Only run if supabase or filterType actually changed
    if (
      supabase &&
      (currentSupabase !== supabase || currentFilterType !== filterType)
    ) {
      // Update tracking variables without triggering reactive updates
      currentSupabase = supabase;
      currentFilterType = filterType;

      notificationState.initialize(supabase);

      // If we have a specific filter type and this is different from what's loaded
      if (filterType && filterType !== currentFilterType) {
        notificationState.loadNotifications({ type: filterType });
      }
    }
  });

  // Get icon for notification type
  function getNotificationIcon(type: NotificationType) {
    switch (type) {
      case 'system':
        return AlertCircle;
      case 'content':
        return Bell;
      case 'user':
        return User;
      case 'playlist_update':
        return Play;
      case 'mention':
        return AtSign;
      default:
        return Bell;
    }
  }

  // Get color class for notification type
  function getNotificationColor(type: NotificationType) {
    switch (type) {
      case 'system':
        return 'text-orange-500';
      case 'content':
        return 'text-blue-500';
      case 'user':
        return 'text-green-500';
      case 'playlist_update':
        return 'text-purple-500';
      case 'mention':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  }

  // Handle notification click - now just a visual click, no navigation needed
  function handleNotificationClick(notification: NotificationWithMeta) {
    // No action needed - notifications are marked as read when bell opens
    // Call the callback if provided (to close the menu)
    onNotificationClick?.();
  }

  // Handle delete notification
  async function handleDelete(
    notification: NotificationWithMeta,
    event: Event
  ) {
    event.stopPropagation();
    await notificationState.deleteNotifications([notification.id]);
  }

  // Load more notifications
  async function loadMore() {
    if (loadingMore || !notificationState.hasMore) return;

    loadingMore = true;
    await notificationState.loadNotifications(
      filterType ? { type: filterType } : {},
      true // append
    );
    loadingMore = false;
  }

  // Handle scroll for infinite loading
  function handleScroll(event: Event) {
    const target = event.target as HTMLElement;
    const scrolledToBottom =
      target.scrollHeight - target.scrollTop <= target.clientHeight + 100;

    if (scrolledToBottom && notificationState.hasMore && !loadingMore) {
      loadMore();
    }
  }
</script>

<div class="w-full">
  {#if notificationState.isLoading && notificationState.notifications.length === 0}
    <!-- Loading skeleton -->
    <div class="space-y-2 p-4">
      {#each Array(3)}}
        <div class="flex items-start space-x-3">
          <Skeleton class="h-8 w-8 rounded-full" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-4 w-3/4" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      {/each}
    </div>
  {:else if notificationState.notifications.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center p-8 text-center">
      <Bell class="text-muted-foreground mb-4 h-12 w-12" />
      <p class="text-muted-foreground">
        {filterType ? `No ${filterType} notifications` : 'No notifications yet'}
      </p>
    </div>
  {:else}
    <!-- Notifications list -->
    <ScrollArea
      class="w-full {compact ? 'max-h-80' : 'max-h-96'}"
      onscroll={handleScroll}
    >
      <div class="space-y-1">
        {#each notificationState.notifications as notification (notification.id)}
          <div
            class="group hover:bg-muted/50 flex cursor-pointer items-start space-x-3 p-3 transition-colors
              {!notification.read ? 'bg-muted/20' : ''}"
            onclick={() => handleNotificationClick(notification)}
            role="button"
            tabindex="0"
            onkeydown={(e) =>
              e.key === 'Enter' && handleNotificationClick(notification)}
          >
            <!-- Icon -->
            <div class="mt-1 flex-shrink-0">
              <div
                class="bg-muted flex h-8 w-8 items-center justify-center rounded-full"
              >
                {#if notification.type === 'system'}
                  <AlertCircle class="h-4 w-4 text-orange-500" />
                {:else if notification.type === 'content'}
                  <Bell class="h-4 w-4 text-blue-500" />
                {:else if notification.type === 'user'}
                  <User class="h-4 w-4 text-green-500" />
                {:else if notification.type === 'playlist_update'}
                  <Play class="h-4 w-4 text-purple-500" />
                {:else if notification.type === 'mention'}
                  <AtSign class="h-4 w-4 text-red-500" />
                {:else}
                  <Bell class="h-4 w-4 text-gray-500" />
                {/if}
              </div>
              {#if !notification.read}
                <div
                  class="absolute -mt-1 -ml-1 h-3 w-3 rounded-full bg-blue-500"
                ></div>
              {/if}
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <p
                    class="text-sm leading-tight font-medium {!notification.read
                      ? 'font-semibold'
                      : ''}"
                  >
                    {notification.title}
                  </p>
                  <div class="text-muted-foreground mt-1 text-sm">
                    {@html notification.message}
                  </div>

                  <div class="mt-2 flex items-center space-x-2">
                    <span class="text-muted-foreground text-xs">
                      {notification.formatted_time}
                    </span>
                  </div>
                </div>

                <!-- Actions -->
                <div class="ml-2 flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-muted-foreground hover:text-destructive h-6 w-6 p-0 opacity-60 transition-opacity hover:opacity-100"
                    onclick={(e) => handleDelete(notification, e)}
                    title="Remove notification"
                  >
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        {/each}

        <!-- Load more indicator -->
        {#if loadingMore}
          <div class="flex items-center justify-center p-4">
            <LoaderIcon class="mr-2 h-4 w-4 animate-spin" />
            <span class="text-muted-foreground text-sm">Loading more...</span>
          </div>
        {:else if notificationState.hasMore}
          <div class="flex items-center justify-center p-4">
            <Button
              variant="ghost"
              size="sm"
              onclick={loadMore}
              disabled={notificationState.isLoading}
            >
              Load more
            </Button>
          </div>
        {/if}
      </div>
    </ScrollArea>
  {/if}
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
