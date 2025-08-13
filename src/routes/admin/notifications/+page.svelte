<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Select from '$lib/components/ui/select';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import {
    Send,
    TestTube,
    RotateCcw,
    Loader,
    Trash2,
    Clock,
    XCircle,
    CircleCheck,
    Activity,
  } from '@lucide/svelte';
  import { showToast } from '$lib/state/notifications.svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { zodClient, type Infer } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import * as Table from '$lib/components/ui/table';
  import DatetimeInput from '$lib/components/ui/datetime-input.svelte';
  import {
    adminNotificationSchema,
    type AdminNotificationSchema,
  } from './admin-notifications-schema';
  import type { NotificationType } from '$lib/supabase/notifications';
  import type { Database } from '$lib/supabase/database.types';
  import { getNavigationState } from '$lib/state/navigation.svelte';
  import { invalidate } from '$app/navigation';
  import type { SupabaseClient } from '@supabase/supabase-js';

  type NotificationRow = Database['public']['Tables']['notifications']['Row'];
  type SystemLogRow = Database['public']['Tables']['system_logs']['Row'];

  let {
    data,
  }: {
    data: {
      form: SuperValidated<Infer<AdminNotificationSchema>>;
      pendingNotifications: NotificationRow[];
      sentNotifications: NotificationRow[];
      expiredNotifications: NotificationRow[];
      users: { id: string; username: string | null }[];
      systemLogs?: SystemLogRow[]; // Optional new data
      supabase: SupabaseClient<Database>;
    };
  } = $props();
  const { supabase } = $derived(data);

  const navigationState = getNavigationState();

  let isSubmitting = $state(false);
  let testSubmitting = $state(false);
  let manualCleanupSubmitting = $state(false);

  let currentAction = $state<string>('');
  let cancellingId = $state<string | null>(null);

  // Updated cancelNotification function to use RPC
  async function cancelNotification(notificationId: string) {
    if (cancellingId) return; // Prevent multiple concurrent cancellations

    cancellingId = notificationId;

    try {
      const { data: result, error } = await supabase.rpc(
        'remove_notification',
        {
          notification_id: notificationId,
        }
      );

      if (error) {
        console.error('Error canceling notification:', error);
        showToast('Failed to cancel notification', 'error');
      } else if (result) {
        showToast('Notification canceled successfully', 'success');
        navigationState.refreshData();
        invalidate('supabase:db:notifications');
      } else {
        showToast('Notification not found or already removed', 'error');
      }
    } catch (error) {
      console.error('Error canceling notification:', error);
      showToast('Failed to cancel notification', 'error');
    } finally {
      cancellingId = null;
    }
  }

  // Optional: Manual cleanup function
  async function triggerManualCleanup() {
    if (manualCleanupSubmitting) return;

    manualCleanupSubmitting = true;

    try {
      const { data: deletedCount, error } = await supabase.rpc(
        'cleanup_expired_notifications'
      );

      if (error) {
        console.error('Error during manual cleanup:', error);
        showToast('Failed to cleanup expired notifications', 'error');
      } else {
        showToast(
          `Manual cleanup completed. Removed ${deletedCount} expired notifications.`,
          'success'
        );
        navigationState.refreshData();
        invalidate('supabase:db:notifications');
      }
    } catch (error) {
      console.error('Error during manual cleanup:', error);
      showToast('Failed to cleanup expired notifications', 'error');
    } finally {
      manualCleanupSubmitting = false;
    }
  }

  function formatDateTime(dateTimeString: string | null): string {
    if (!dateTimeString) return 'N/A';

    try {
      return new Date(dateTimeString).toLocaleString();
    } catch (error) {
      return 'Invalid Date';
    }
  }

  function getNotificationStatus(notification: any): {
    text: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  } {
    const now = new Date().toISOString();

    if (notification.start_datetime && notification.start_datetime > now) {
      return { text: 'Pending', variant: 'outline' };
    }

    if (notification.end_datetime && notification.end_datetime <= now) {
      return { text: 'Expired', variant: 'destructive' };
    }

    return { text: 'Active', variant: 'default' };
  }

  const notificationForm = superForm(data.form, {
    validators: zodClient(adminNotificationSchema),
    validationMethod: 'onsubmit',
    resetForm: false, // Prevent form reset after submission

    onSubmit({ formData }) {
      const action = formData.get('_action')?.toString() || '';
      currentAction = action;

      if (action === 'sendTestNotification') {
        testSubmitting = true;
      } else {
        isSubmitting = true;
      }
    },
    onResult(event) {
      if (event.result.type !== 'redirect') {
        if (currentAction === 'sendTestNotification') {
          testSubmitting = false;
        } else {
          isSubmitting = false;
        }
      }
    },
    onUpdated({ form }) {
      // Handle success/error messages
      if (form.valid && !form.errors) {
        if (currentAction === 'sendTestNotification') {
          showToast('✅ Test notification sent successfully!', 'success');
        } else {
          showToast(`✅ Global notification sent successfully!`, 'success');
        }
      } else if (form.errors) {
        // Handle validation errors
        const errorMessages = Object.values(form.errors).flat();
        if (errorMessages.length > 0) {
          showToast(`❌ Error: ${errorMessages[0]}`, 'error');
        }
      }
      navigationState.refreshData();
    },
  });

  const { form: formData, enhance } = notificationForm;

  const notificationTypes = [
    { value: 'system', label: 'System' },
    { value: 'content', label: 'Content' },
    { value: 'user', label: 'User' },
    { value: 'playlist_update', label: 'Playlist Update' },
    { value: 'mention', label: 'Mention' },
  ];

  let selectedType = $state({ value: 'system', label: 'System' });

  // Predefined templates
  const templates: Record<
    string,
    {
      type: NotificationType;
      title: string;
      message: string;
    }
  > = {
    welcome: {
      type: 'system',
      title: 'Welcome Message',
      message:
        'Thanks for being part of our community! Explore playlists and discover great content.',
    },
    feature: {
      type: 'system',
      title: 'New Feature Released!',
      message:
        'Check out our <a href="/features">enhanced playlist features</a> and improved user experience.',
    },
    maintenance: {
      type: 'system',
      title: 'Scheduled Maintenance',
      message:
        'We will be performing maintenance tonight from <b>2-4 AM EST</b>. Some features may be temporarily unavailable.<br><br>For updates, visit our <a href="/status">status page</a>.',
    },
  };

  function loadTemplate(templateName: keyof typeof templates) {
    if (!notificationForm) return;

    const template = templates[templateName];
    selectedType =
      notificationTypes.find((t) => t.value === template.type) ||
      notificationTypes[0];

    // Update form data
    $formData.type = template.type;
    $formData.title = template.title;
    $formData.message = template.message;
  }

  function resetForm() {
    if (!notificationForm) return;

    selectedType = notificationTypes[0];
    $formData.type = 'system';
    $formData.title = '';
    $formData.message = '';
    $formData.startDatetime = '';
    $formData.endDatetime = '';
  }

  // Sync selectedType with form data
  $effect(() => {
    if (notificationForm && $formData.type) {
      selectedType =
        notificationTypes.find((t) => t.value === $formData.type) ||
        notificationTypes[0];
    }
  });
</script>

<svelte:head>
  <title>Admin - Notification Management | Bombastic</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
  <div class="mb-8">
    <h1 class="mb-2 text-3xl font-bold">Notification Management</h1>
    <p class="text-muted-foreground">
      Send notifications to all users or test notifications
    </p>
  </div>

  <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
    <!-- Notification Form -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Create Notification</Card.Title>
      </Card.Header>
      <Card.Content>
        <!-- Template Buttons -->
        <div class="mb-6">
          <Label class="mb-3 block text-sm font-medium">Quick Templates</Label>
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={() => loadTemplate('welcome')}
            >
              Welcome
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => loadTemplate('feature')}
            >
              New Feature
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => loadTemplate('maintenance')}
            >
              Maintenance
            </Button>
            <Button variant="outline" size="sm" onclick={resetForm}>
              <RotateCcw class="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        {#if data && notificationForm}
          <form method="POST" use:enhance>
            <div class="space-y-6">
              <!-- Type Selection -->
              <Form.Field form={notificationForm} name="type">
                <Form.Control>
                  {#snippet children({ props })}
                    <Label for="type">Type</Label>
                    <Select.Root
                      type="single"
                      bind:value={$formData.type}
                      onValueChange={(v) => {
                        if (v) {
                          $formData.type = v as NotificationType;
                          selectedType =
                            notificationTypes.find((t) => t.value === v) ||
                            notificationTypes[0];
                        }
                      }}
                    >
                      <Select.Trigger>
                        {selectedType?.label || 'Select notification type'}
                      </Select.Trigger>
                      <Select.Content>
                        {#each notificationTypes as type (type.value)}
                          <Select.Item value={type.value}
                            >{type.label}</Select.Item
                          >
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    <input
                      type="hidden"
                      name="type"
                      bind:value={$formData.type}
                    />
                  {/snippet}
                </Form.Control>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <!-- Title -->
              <Form.Field form={notificationForm} name="title">
                <Form.Control>
                  {#snippet children({ props })}
                    <Label for="title">Title</Label>
                    <Input
                      {...props}
                      id="title"
                      name="title"
                      type="text"
                      bind:value={$formData.title}
                      required
                      placeholder="Enter notification title"
                    />
                  {/snippet}
                </Form.Control>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <!-- Message -->
              <Form.Field form={notificationForm} name="message">
                <Form.Control>
                  {#snippet children({ props })}
                    <Label for="message">Message</Label>
                    <Textarea
                      {...props}
                      id="message"
                      name="message"
                      bind:value={$formData.message}
                      required
                      rows={4}
                      placeholder="Enter notification message (HTML supported: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, &lt;a href=&quot;...&quot;&gt;link&lt;/a&gt;, etc.)"
                    />
                    <p class="text-muted-foreground text-xs">
                      HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;u&gt;,
                      &lt;br&gt;, &lt;a href="..."&gt; are supported for rich
                      formatting and links
                    </p>
                  {/snippet}
                </Form.Control>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <!-- Start DateTime (Optional) -->
              <Form.Field form={notificationForm} name="startDatetime">
                <Form.Control>
                  {#snippet children({ props })}
                    <DatetimeInput
                      {...props}
                      id="startDatetime"
                      name="startDatetime"
                      label="Start Date & Time (Optional)"
                      bind:value={$formData.startDatetime}
                      description="When notification should start being visible (default: immediately)"
                    />
                  {/snippet}
                </Form.Control>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <!-- End DateTime (Optional) -->
              <Form.Field form={notificationForm} name="endDatetime">
                <Form.Control>
                  {#snippet children({ props })}
                    <DatetimeInput
                      {...props}
                      id="endDatetime"
                      name="endDatetime"
                      label="End Date & Time (Optional)"
                      bind:value={$formData.endDatetime}
                      description="When notification should automatically expire (default: never expires)"
                    />
                  {/snippet}
                </Form.Control>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <!-- Action Buttons -->
              <div class="flex gap-3 pt-4">
                <Button
                  type="submit"
                  formaction="?/sendGlobalNotification"
                  disabled={isSubmitting ||
                    !$formData.title ||
                    !$formData.message}
                  class="flex-1"
                >
                  {#if isSubmitting}
                    <Loader class="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  {:else}
                    <Send class="mr-2 h-4 w-4" />
                    Send to All Users
                  {/if}
                </Button>

                <Button
                  type="submit"
                  formaction="?/sendTestNotification"
                  disabled={testSubmitting ||
                    !$formData.title ||
                    !$formData.message}
                  variant="outline"
                  class="flex-1"
                >
                  {#if testSubmitting}
                    <Loader class="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  {:else}
                    <TestTube class="mr-2 h-4 w-4" />
                    Test (Send to Me)
                  {/if}
                </Button>
              </div>
            </div>
          </form>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Info Panel -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Information & Actions</Card.Title>
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Manual Cleanup Button -->
        <div>
          <h3 class="mb-3 text-sm font-medium">Admin Actions</h3>
          <Button
            variant="outline"
            size="sm"
            onclick={triggerManualCleanup}
            disabled={manualCleanupSubmitting}
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
              <Badge variant="outline">System</Badge>
              <span class="text-muted-foreground text-sm"
                >Platform announcements, maintenance</span
              >
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">Content</Badge>
              <span class="text-muted-foreground text-sm"
                >New videos, updates</span
              >
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">User</Badge>
              <span class="text-muted-foreground text-sm"
                >User interactions, follows</span
              >
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">Playlist</Badge>
              <span class="text-muted-foreground text-sm">Playlist changes</span
              >
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">Mention</Badge>
              <span class="text-muted-foreground text-sm">User mentions</span>
              >
            </div>
          </div>
        </div>

        <div>
          <h3 class="mb-3 text-sm font-medium">User Stats</h3>
          <p class="text-muted-foreground text-sm">
            Users in system: {data.users?.length || 0}
          </p>
        </div>

        <div>
          <h3 class="mb-3 text-sm font-medium">Usage</h3>
          <ul class="text-muted-foreground space-y-1 text-sm">
            <li>• Use "Test" button to preview notifications before sending</li>
            <li>• Use HTML links: &lt;a href="..."&gt;link text&lt;/a&gt;</li>
            <li>• Notifications appear under the bell icon only</li>
            <li>• Users can remove notifications individually</li>
            <li>
              • Form doesn't clear after submit for easy test/send workflow
            </li>
            <li>• Expired notifications are automatically cleaned up daily</li>
          </ul>
        </div>

        <!-- Optional: System Logs Display -->
        {#if data.systemLogs && data.systemLogs.length > 0}
          <div>
            <h3 class="mb-3 flex items-center gap-2 text-sm font-medium">
              <Activity class="h-4 w-4" />
              Recent Activity
            </h3>
            <div class="max-h-32 space-y-1 overflow-y-auto">
              {#each data.systemLogs.slice(0, 5) as log (log.id)}
                <div class="rounded border p-2 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="font-medium">{log.event_type}</span>
                    <span class="text-muted-foreground">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                  {#if log.details && typeof log.details === 'object'}
                    <div class="text-muted-foreground mt-1">
                      {#if log.event_type === 'notification_cleanup'}
                        Removed {log.details.deleted_count || 0} expired notifications
                      {:else if log.event_type === 'notification_removed'}
                        Notification removed by admin
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Notification Management Lists -->
  <div class="mt-8">
    <h2 class="mb-6 text-2xl font-bold">Notification Management</h2>

    <div class="space-y-8">
      <!-- Pending Notifications -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Clock class="h-5 w-5 text-yellow-500" />
            Pending Notifications ({data.pendingNotifications.length})
          </Card.Title>
          <p class="text-muted-foreground text-sm">
            Notifications scheduled to be sent in the future
          </p>
        </Card.Header>
        <Card.Content>
          {#if data.pendingNotifications.length === 0}
            <p class="text-muted-foreground py-4">No pending notifications</p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Title</Table.Head>
                  <Table.Head>Start Date</Table.Head>
                  <Table.Head>End Date</Table.Head>
                  <Table.Head>Created</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each data.pendingNotifications as notification (notification.id)}
                  <Table.Row>
                    <Table.Cell>
                      <div>
                        <div class="font-medium">{notification.title}</div>
                        <div
                          class="text-muted-foreground max-w-md truncate text-sm"
                        >
                          {notification.message}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      >{formatDateTime(notification.start_datetime)}</Table.Cell
                    >
                    <Table.Cell
                      >{formatDateTime(notification.end_datetime)}</Table.Cell
                    >
                    <Table.Cell
                      >{formatDateTime(notification.created_at)}</Table.Cell
                    >
                    <Table.Cell>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={cancellingId === notification.id}
                        onclick={() => cancelNotification(notification.id)}
                      >
                        {#if cancellingId === notification.id}
                          <Loader class="mr-2 h-3 w-3 animate-spin" />
                          Canceling...
                        {:else}
                          <Trash2 class="mr-2 h-3 w-3" />
                          Cancel
                        {/if}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Sent/Active Notifications -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <CircleCheck class="h-5 w-5 text-green-500" />
            Active Notifications ({data.sentNotifications.length})
          </Card.Title>
          <p class="text-muted-foreground text-sm">
            Notifications currently visible to users
          </p>
        </Card.Header>
        <Card.Content>
          {#if data.sentNotifications.length === 0}
            <p class="text-muted-foreground py-4">No active notifications</p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Title</Table.Head>
                  <Table.Head>Start Date</Table.Head>
                  <Table.Head>End Date</Table.Head>
                  <Table.Head>Created</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each data.sentNotifications as notification (notification.id)}
                  <Table.Row>
                    <Table.Cell>
                      <div>
                        <div class="font-medium">{notification.title}</div>
                        <div
                          class="text-muted-foreground max-w-md truncate text-sm"
                        >
                          {notification.message}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      >{formatDateTime(notification.start_datetime)}</Table.Cell
                    >
                    <Table.Cell
                      >{formatDateTime(notification.end_datetime)}</Table.Cell
                    >
                    <Table.Cell
                      >{formatDateTime(notification.created_at)}</Table.Cell
                    >
                    <Table.Cell>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={cancellingId === notification.id}
                        onclick={() => cancelNotification(notification.id)}
                      >
                        {#if cancellingId === notification.id}
                          <Loader class="mr-2 h-3 w-3 animate-spin" />
                          Removing...
                        {:else}
                          <Trash2 class="mr-2 h-3 w-3" />
                          Remove
                        {/if}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Expired Notifications -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <XCircle class="h-5 w-5 text-red-500" />
            Expired Notifications ({data.expiredNotifications.length})
          </Card.Title>
          <p class="text-muted-foreground text-sm">
            Notifications that have passed their expiration date
          </p>
        </Card.Header>
        <Card.Content>
          {#if data.expiredNotifications.length === 0}
            <p class="text-muted-foreground py-4">No expired notifications</p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Title</Table.Head>
                  <Table.Head>Start Date</Table.Head>
                  <Table.Head>End Date</Table.Head>
                  <Table.Head>Created</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each data.expiredNotifications as notification (notification.id)}
                  <Table.Row>
                    <Table.Cell>
                      <div>
                        <div class="font-medium">{notification.title}</div>
                        <div
                          class="text-muted-foreground max-w-md truncate text-sm"
                        >
                          {notification.message}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      >{formatDateTime(notification.start_datetime)}</Table.Cell
                    >
                    <Table.Cell
                      >{formatDateTime(notification.end_datetime)}</Table.Cell
                    >
                    <Table.Cell
                      >{formatDateTime(notification.created_at)}</Table.Cell
                    >
                    <Table.Cell>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={cancellingId === notification.id}
                        onclick={() => cancelNotification(notification.id)}
                      >
                        {#if cancellingId === notification.id}
                          <Loader class="mr-2 h-3 w-3 animate-spin" />
                          Removing...
                        {:else}
                          <Trash2 class="mr-2 h-3 w-3" />
                          Remove
                        {/if}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
