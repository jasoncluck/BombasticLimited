<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { X, Bell } from '@lucide/svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import {
    type NotificationWithMeta,
    type NotificationType,
    deleteNotifications,
  } from '$lib/supabase/notifications';
  import { createSafeHtml } from '$lib/utils/html-sanitizer';
  import FaviconIcon from '$lib/components/icons/favicon-icon.svelte';
  import { slide, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { getNavigationState } from '$lib/state/navigation.svelte';
  import Loader from '../loader.svelte';

  let {
    supabase,
    filterType,
    onNotificationClick,
  }: {
    supabase: SupabaseClient<Database>;
    filterType?: NotificationType;
    onNotificationClick?: () => void;
  } = $props();

  const navigationState = getNavigationState();
  const {
    data: { userNotifications },
  } = $derived(navigationState);

  async function handleDelete(notification: NotificationWithMeta) {
    await deleteNotifications({
      notificationIds: [notification.notification_id],
      supabase,
    });

    console.log('refreshing after delete');
    navigationState.refreshData();
  }

  // Helper function to format relative time based on start_datetime or created_at
  function formatRelativeTime(notification: NotificationWithMeta): string {
    const timestamp =
      notification.start_datetime || notification.notification_created_at;
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffInSeconds = Math.floor(
      (now.getTime() - notificationTime.getTime()) / 1000
    );

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } else {
      return notificationTime.toLocaleDateString();
    }
  }

  // Handle link clicks in notification messages
  function handleNotificationMessageClick(event: Event) {
    const target = event.target as Element;
    if (target.tagName.toLowerCase() === 'a') {
      // If a link was clicked, call the callback to close the drawer
      onNotificationClick?.();
    }
  }
</script>

{#if !userNotifications}
  <Loader variant="block" />
{:else}
  <div class="w-full overflow-hidden">
    {#if userNotifications.length === 0}
      <!-- Empty state -->
      <div
        class="flex flex-col items-center justify-center p-8 text-center"
        in:fade={{ duration: 300, delay: 150 }}
      >
        <Bell class="text-muted-foreground mb-4 h-12 w-12" />
        <p class="text-muted-foreground">
          {filterType ? `No ${filterType} notifications` : 'No notifications'}
        </p>
      </div>
    {:else}
      <!-- Notifications list -->
      <ScrollArea type="scroll">
        <div class="space-y-1">
          {#each userNotifications as userNotification (userNotification.notification_id)}
            <div
              class="group hover:bg-muted/50 flex items-start space-x-3 p-3 transition-colors
                {!userNotification.read ? 'bg-muted/20' : ''}"
              in:slide={{ duration: 300, easing: quintOut }}
              out:slide={{ duration: 250, easing: quintOut }}
            >
              <!-- Icon -->
              <div class="mt-1 flex-shrink-0">
                <div
                  class="bg-muted flex h-8 w-8 items-center justify-center rounded-full"
                >
                  {#if userNotification.type === 'system'}
                    <FaviconIcon class="h-4 w-4" />
                  {:else}
                    <Bell class="h-4 w-4 text-gray-500" />
                  {/if}
                </div>
                {#if !userNotification.read}
                  <div
                    class="bg-primary absolute -mt-1 -ml-1 h-3 w-3 rounded-full"
                  ></div>
                {/if}
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <p
                      class="text-sm leading-tight font-medium {!userNotification.read
                        ? 'font-semibold'
                        : ''}"
                    >
                      {userNotification.title}
                    </p>
                    <div
                      class="text-muted-foreground [&_b]:text-foreground [&_strong]:text-foreground
                        [&_a]:text-primary [&_a]:decoration-primary/30
                        [&_a]:hover:text-primary [&_a]:hover:decoration-primary/50 mt-1
                        text-sm leading-relaxed [&_a]:inline-block [&_a]:cursor-pointer [&_a]:break-words
                        [&_a]:transition-colors
                        [&_b]:font-semibold [&_em]:italic [&_i]:italic [&_strong]:font-semibold [&_u]:underline"
                      onclick={handleNotificationMessageClick}
                      role="presentation"
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      {@html createSafeHtml(userNotification.message)}
                    </div>

                    <div class="mt-2 flex items-center space-x-2">
                      <span class="text-muted-foreground text-xs">
                        {formatRelativeTime(userNotification)}
                      </span>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="ml-2 flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="ghost-button-minimal text-muted-foreground h-6 w-6 p-0 opacity-60 transition-opacity hover:text-red-500 hover:opacity-100"
                      onclick={() => handleDelete(userNotification)}
                      title="Remove notification"
                    >
                      <X class="h-3 w-3" />
                      <span class="sr-only"> Remove notification </span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </ScrollArea>
    {/if}
  </div>
{/if}
