<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import {
    Loader,
    Trash2,
    Clock,
    CircleCheck,
    CircleX,
    FlaskConical,
  } from '@lucide/svelte';
  import type { Database } from '$lib/supabase/database.types';
  import { formatDateWithTimezone, formatDateTime } from '$lib/utils/datetime';

  type NotificationRow = Database['public']['Tables']['notifications']['Row'];

  interface NotificationSection {
    title: string;
    icon: typeof Clock;
    iconColor: string;
    data: NotificationRow[];
    description: string;
    actionText: { normal: string; loading: string };
  }

  interface Props {
    pendingNotifications: NotificationRow[];
    sentNotifications: NotificationRow[];
    expiredNotifications: NotificationRow[];
    cancellingId: number | null;
    onCancelNotification: (id: number) => void;
  }

  let {
    pendingNotifications,
    sentNotifications,
    expiredNotifications,
    cancellingId,
    onCancelNotification,
  }: Props = $props();

  const notificationSections: NotificationSection[] = $derived([
    {
      title: 'Pending Notifications',
      icon: Clock,
      iconColor: 'text-yellow-500',
      data: pendingNotifications,
      description: 'Notifications scheduled to be sent in the future',
      actionText: { normal: 'Cancel', loading: 'Canceling...' },
    },
    {
      title: 'Active Notifications',
      icon: CircleCheck,
      iconColor: 'text-green-500',
      data: sentNotifications,
      description: 'Notifications currently visible to users',
      actionText: { normal: 'Remove', loading: 'Removing...' },
    },
    {
      title: 'Expired Notifications',
      icon: CircleX,
      iconColor: 'text-red-500',
      data: expiredNotifications,
      description: 'Notifications that have passed their expiration date',
      actionText: { normal: 'Remove', loading: 'Removing...' },
    },
  ]);
</script>

<div class="mt-8 sm:mt-12">
  <h2 class="mb-6 text-xl font-bold sm:text-2xl">Notification Management</h2>

  <div class="space-y-6 sm:space-y-8">
    {#each notificationSections as section (section.title)}
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-lg sm:text-xl">
            {#if section.icon === Clock}
              <Clock class="h-5 w-5 {section.iconColor}" />
            {:else if section.icon === CircleCheck}
              <CircleCheck class="h-5 w-5 {section.iconColor}" />
            {:else if section.icon === CircleX}
              <CircleX class="h-5 w-5 {section.iconColor}" />
            {/if}
            {section.title} ({section.data.length})
          </Card.Title>
          <p class="text-muted-foreground text-sm">
            {section.description}
          </p>
        </Card.Header>
        <Card.Content>
          {#if section.data.length === 0}
            <p class="text-muted-foreground py-4">
              No {section.title.toLowerCase()}
            </p>
          {:else}
            <!-- Mobile Card View -->
            <div class="space-y-4 sm:hidden">
              {#each section.data as notification (notification.id)}
                <div class="rounded border p-4">
                  <div class="mb-2">
                    <div class="flex items-center gap-2">
                      <div class="font-medium">{notification.title}</div>
                      {#if notification.is_test}
                        <Badge variant="secondary" class="text-xs">
                          <FlaskConical class="mr-1 h-3 w-3" />
                          Test
                        </Badge>
                      {/if}
                    </div>
                    <div
                      class="text-muted-foreground mt-1 line-clamp-2 text-sm"
                    >
                      {notification.message}
                    </div>
                  </div>
                  <div class="text-muted-foreground mb-3 space-y-1 text-xs">
                    {#if notification.start_datetime}
                      <div>
                        Start: {formatDateWithTimezone(
                          notification.start_datetime
                        )}
                      </div>
                    {/if}
                    {#if notification.end_datetime}
                      <div>
                        End: {formatDateWithTimezone(notification.end_datetime)}
                      </div>
                    {/if}
                    {#if notification.created_at}
                      <div>
                        Created: {formatDateWithTimezone(
                          notification.created_at
                        )}
                      </div>
                    {/if}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancellingId === notification.id}
                    onclick={() => onCancelNotification(notification.id)}
                    class="w-full"
                  >
                    {#if cancellingId === notification.id}
                      <Loader class="mr-2 h-3 w-3 animate-spin" />
                      {section.actionText.loading}
                    {:else}
                      <Trash2 class="mr-2 h-3 w-3" />
                      {section.actionText.normal}
                    {/if}
                  </Button>
                </div>
              {/each}
            </div>

            <!-- Desktop Table View -->
            <div class="hidden overflow-x-auto sm:block">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head class="min-w-[200px]">Title</Table.Head>
                    <Table.Head class="w-[80px]">Type</Table.Head>
                    <Table.Head class="hidden w-[160px] lg:table-cell"
                      >Start Date</Table.Head
                    >
                    <Table.Head class="hidden w-[160px] lg:table-cell"
                      >End Date</Table.Head
                    >
                    <Table.Head class="hidden w-[140px] md:table-cell"
                      >Created</Table.Head
                    >
                    <Table.Head class="w-[100px]">Actions</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each section.data as notification (notification.id)}
                    <Table.Row>
                      <Table.Cell class="max-w-0">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <div class="truncate font-medium">
                              {notification.title}
                            </div>
                            {#if notification.is_test}
                              <Badge variant="secondary" class="text-xs">
                                <FlaskConical class="mr-1 h-3 w-3" />
                                Test
                              </Badge>
                            {/if}
                          </div>
                          <div
                            class="text-muted-foreground mt-1 truncate text-sm"
                          >
                            {notification.message}
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant="outline" class="text-xs">
                          {notification.type === 'system'
                            ? 'System'
                            : 'Playlist'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell class="hidden lg:table-cell">
                        <span class="text-xs">
                          {formatDateTime(notification.start_datetime)}
                        </span>
                      </Table.Cell>
                      <Table.Cell class="hidden lg:table-cell">
                        <span class="text-xs">
                          {formatDateTime(notification.end_datetime)}
                        </span>
                      </Table.Cell>
                      <Table.Cell class="hidden md:table-cell">
                        <span class="text-xs">
                          {formatDateTime(notification.created_at)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={cancellingId === notification.id}
                          onclick={() => onCancelNotification(notification.id)}
                          class="whitespace-nowrap"
                        >
                          {#if cancellingId === notification.id}
                            <Loader class="h-3 w-3 animate-spin sm:mr-2" />
                            <span class="hidden sm:inline"
                              >{section.actionText.loading}</span
                            >
                          {:else}
                            <Trash2 class="h-3 w-3 sm:mr-2" />
                            <span class="hidden sm:inline"
                              >{section.actionText.normal}</span
                            >
                          {/if}
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/each}
  </div>
</div>
