<script lang="ts">
  import { goto } from '$app/navigation';
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
    LoaderIcon
  } from '@lucide/svelte';
  import { getNotificationState } from '$lib/state/notifications.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { NotificationWithMeta, NotificationType } from '$lib/supabase/notifications';
  import { createDemoNotifications } from '$lib/utils/demo-notifications';

  let {
    supabase,
    showActions = true,
    compact = false,
    filterType,
    onNotificationClick
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

  $effect(() => {
    notificationState.initialize(supabase);
    if (filterType) {
      notificationState.loadNotifications({ type: filterType });
    } else {
      notificationState.loadNotifications();
    }
    
    // For demo purposes, if no real notifications exist, show demo data
    if (notificationState.notifications.length === 0 && !notificationState.isLoading) {
      const demoNotifications = createDemoNotifications();
      // Simulate adding them to the store for demo
      setTimeout(() => {
        if (notificationState.notifications.length === 0) {
          notificationState.notifications = demoNotifications;
          notificationState.unreadCount = demoNotifications.filter(n => !n.read).length;
        }
      }, 1000);
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

  // Handle notification click
  async function handleNotificationClick(notification: NotificationWithMeta) {
    // Mark as read if unread
    if (!notification.read) {
      await notificationState.markAsRead([notification.id]);
    }

    // Navigate to action URL if provided
    if (notification.action_url) {
      goto(notification.action_url);
    }

    // Call the callback if provided
    onNotificationClick?.();
  }

  // Handle mark as read
  async function handleMarkAsRead(notification: NotificationWithMeta, event: Event) {
    event.stopPropagation();
    await notificationState.markAsRead([notification.id]);
  }

  // Handle delete notification
  async function handleDelete(notification: NotificationWithMeta, event: Event) {
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
    const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    
    if (scrolledToBottom && $notificationState.hasMore && !loadingMore && !$isNotificationLoading) {
      loadMore();
    }
  }
</script>

<div class="w-full">
  {#if notificationState.isLoading && notificationState.notifications.length === 0}
    <!-- Loading skeleton -->
    <div class="space-y-2 p-4">
      {#each Array(3) as _}
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
      <Bell class="h-12 w-12 text-muted-foreground mb-4" />
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
            class="group flex items-start space-x-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors
              {!notification.read ? 'bg-muted/20' : ''}
              {notification.is_new ? 'ring-1 ring-primary/20' : ''}"
            onclick={() => handleNotificationClick(notification)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && handleNotificationClick(notification)}
          >
            <!-- Icon -->
            <div class="flex-shrink-0 mt-1">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
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
                <div class="absolute -ml-1 -mt-1 h-3 w-3 rounded-full bg-blue-500"></div>
              {/if}
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <p class="text-sm font-medium leading-tight {!notification.read ? 'font-semibold' : ''}">
                    {notification.title}
                  </p>
                  <p class="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {notification.message}
                  </p>
                  
                  <div class="flex items-center space-x-2 mt-2">
                    <Badge variant="outline" class="text-xs">
                      {notification.type}
                    </Badge>
                    <span class="text-xs text-muted-foreground">
                      {notification.formatted_time}
                    </span>
                    {#if notification.is_new}
                      <Badge variant="secondary" class="text-xs">New</Badge>
                    {/if}
                  </div>
                </div>

                <!-- Actions -->
                {#if showActions}
                  <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    {#if !notification.read}
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-6 w-6 p-0"
                        onclick={(e) => handleMarkAsRead(notification, e)}
                        title="Mark as read"
                      >
                        <Check class="h-3 w-3" />
                      </Button>
                    {/if}
                    
                    {#if notification.action_url}
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-6 w-6 p-0"
                        title="Open link"
                      >
                        <ExternalLink class="h-3 w-3" />
                      </Button>
                    {/if}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onclick={(e) => handleDelete(notification, e)}
                      title="Delete notification"
                    >
                      <Trash2 class="h-3 w-3" />
                    </Button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}

        <!-- Load more indicator -->
        {#if loadingMore}
          <div class="flex items-center justify-center p-4">
            <LoaderIcon class="h-4 w-4 animate-spin mr-2" />
            <span class="text-sm text-muted-foreground">Loading more...</span>
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
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>