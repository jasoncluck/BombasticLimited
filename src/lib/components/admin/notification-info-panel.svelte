<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import { Loader, Trash2, Activity } from '@lucide/svelte';
  import type { Database } from '$lib/supabase/database.types';
  import {
    isNotificationCleanupLog,
    isNotificationRemovedLog,
    isUserNotificationDismissedLog,
  } from '$lib/supabase/notifications';
  import { formatDateWithTimezone } from '$lib/utils/datetime';

  type SystemLogRow = Database['public']['Tables']['system_logs']['Row'];

  interface Props {
    users: { id: string; username: string | null }[];
    systemLogs?: SystemLogRow[];
    manualCleanupSubmitting: boolean;
    onManualCleanup: () => void;
  }

  let { users, systemLogs, manualCleanupSubmitting, onManualCleanup }: Props =
    $props();
</script>

<div class="space-y-6">
  <!-- Information & Actions Card -->
  <Card.Root>
    <Card.Header>
      <Card.Title class="text-lg sm:text-xl">Information & Actions</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-4 sm:space-y-6">
      <!-- Manual Cleanup Button -->
      <div>
        <h3 class="mb-3 text-sm font-medium">Admin Actions</h3>
        <Button
          variant="outline"
          size="sm"
          onclick={onManualCleanup}
          disabled={manualCleanupSubmitting}
          class="w-full text-xs sm:w-auto sm:text-sm"
        >
          {#if manualCleanupSubmitting}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
            Cleaning up...
          {:else}
            <Trash2 class="mr-2 h-4 w-4" />
            Manual Cleanup Expired
          {/if}
        </Button>
        <p class="text-muted-foreground mt-1 text-xs">
          Remove all expired notifications manually (also runs automatically
          daily at 2 AM UTC)
        </p>
      </div>

      <div>
        <h3 class="mb-3 text-sm font-medium">Notification Types</h3>
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="text-xs">System</Badge>
            <span class="text-muted-foreground text-xs sm:text-sm"
              >Platform announcements, maintenance</span
            >
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="text-xs">Playlist Update</Badge>
            <span class="text-muted-foreground text-xs sm:text-sm"
              >Playlist changes and updates</span
            >
          </div>
        </div>
      </div>

      <div>
        <h3 class="mb-3 text-sm font-medium">User Stats</h3>
        <p class="text-muted-foreground text-xs sm:text-sm">
          Users in system: {users?.length || 0}
        </p>
      </div>

      <div>
        <h3 class="mb-3 text-sm font-medium">Usage Tips</h3>
        <ul class="text-muted-foreground space-y-1 text-xs sm:text-sm">
          <li>• Use "Test" button to preview notifications before sending</li>
          <li>• HTML links: &lt;a href="..."&gt;link text&lt;/a&gt;</li>
          <li>• Notifications appear under the bell icon</li>
          <li>• Users can dismiss notifications individually</li>
          <li>• Times are displayed in your local timezone</li>
          <li>• Expired notifications are cleaned up automatically daily</li>
          <li>• Test notifications are only sent to you, not all users</li>
          <li>
            • Form preserves values after test notifications for easy refinement
          </li>
        </ul>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Recent Activity Card -->
  {#if systemLogs && systemLogs.length > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2 text-lg sm:text-xl">
          <Activity class="h-5 w-5" />
          Recent Activity
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {#each systemLogs.slice(0, 5) as log (log.id)}
            <div class="rounded border p-3 text-xs sm:text-sm">
              <div
                class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span class="font-medium"
                  >{log.event_type
                    .replace('_', ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase())}</span
                >
                <span class="text-muted-foreground text-xs">
                  {formatDateWithTimezone(log.created_at)}
                </span>
              </div>
              {#if log.details && typeof log.details === 'object'}
                <div class="text-muted-foreground mt-1 text-xs">
                  {#if log.event_type === 'notification_cleanup' && isNotificationCleanupLog(log.details)}
                    Removed {log.details.deleted_count} expired notifications
                  {:else if log.event_type === 'notification_removed' && isNotificationRemovedLog(log.details)}
                    Notification removed by admin (affected {log.details
                      .affected_users} users)
                  {:else if log.event_type === 'user_notification_dismissed' && isUserNotificationDismissedLog(log.details)}
                    User dismissed {log.details.dismissed_count} notification(s)
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
