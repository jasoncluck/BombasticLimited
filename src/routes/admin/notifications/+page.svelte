<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Select from '$lib/components/ui/select';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Send, TestTube, RotateCcw } from '@lucide/svelte';
  import { showToast } from '$lib/state/notifications.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let testSubmitting = $state(false);

  const notificationTypes = [
    { value: 'system', label: 'System' },
    { value: 'content', label: 'Content' },
    { value: 'user', label: 'User' },
    { value: 'playlist_update', label: 'Playlist Update' },
    { value: 'mention', label: 'Mention' },
  ];

  let selectedType = $state({ value: 'system', label: 'System' });
  let selectedTypeValue = $state('system');
  let title = $state('');
  let message = $state('');
  let actionUrl = $state('');
  let startDatetime = $state('');
  let endDatetime = $state('');

  // Predefined templates
  const templates = {
    welcome: {
      type: 'system',
      title: 'Welcome to Bombastic!',
      message:
        'Thanks for being part of our community! Explore playlists and discover great content.',
      actionUrl: '',
    },
    feature: {
      type: 'system',
      title: 'New Feature Released!',
      message:
        'Check out our enhanced playlist features and improved user experience.',
      actionUrl: '/features',
    },
    maintenance: {
      type: 'system',
      title: 'Scheduled Maintenance',
      message:
        'We will be performing maintenance tonight from 2-4 AM EST. Some features may be temporarily unavailable.',
      actionUrl: '',
    },
  };

  function loadTemplate(templateName: keyof typeof templates) {
    const template = templates[templateName];
    selectedType = notificationTypes.find(t => t.value === template.type) || notificationTypes[0];
    selectedTypeValue = template.type;
    title = template.title;
    message = template.message;
    actionUrl = template.actionUrl;
  }

  function resetForm() {
    selectedType = notificationTypes[0];
    selectedTypeValue = 'system';
    title = '';
    message = '';
    actionUrl = '';
    startDatetime = '';
    endDatetime = '';
  }

  // Handle form submission success
  $effect(() => {
    if (form?.success) {
      if (form.count !== undefined) {
        showToast(`✅ Global notification sent successfully to ${form.count} users!`, 'success');
      } else {
        showToast('✅ Test notification sent successfully!', 'success');
      }
    } else if (form?.error) {
      showToast(`❌ Error: ${form.error}`, 'error');
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

  <!-- Remove the result messages section since we're using toasts now -->

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
            <Button
              variant="outline"
              size="sm"
              onclick={resetForm}
            >
              <RotateCcw class="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        <form
          method="POST"
          use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
              await update();
              isSubmitting = false;
            };
          }}
        >
          <div class="space-y-6">
            <!-- Type Selection -->
            <div class="space-y-2">
              <Label for="type">Type</Label>
              <Select.Root
                type="single"
                bind:value={selectedTypeValue}
                onValueChange={(v) => {
                  if (v) {
                    selectedType = notificationTypes.find(t => t.value === v) || notificationTypes[0];
                  }
                }}
              >
                <Select.Trigger>
                  {selectedType?.label || 'Select notification type'}
                </Select.Trigger>
                <Select.Content>
                  {#each notificationTypes as type}
                    <Select.Item value={type.value}>{type.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <input type="hidden" name="type" value={selectedTypeValue} />
            </div>

            <!-- Title -->
            <div class="space-y-2">
              <Label for="title">Title</Label>
              <Input
                id="title"
                name="title"
                type="text"
                value={title}
                oninput={(e) => title = e.currentTarget.value}
                required
                placeholder="Enter notification title"
              />
            </div>

            <!-- Message -->
            <div class="space-y-2">
              <Label for="message">Message</Label>
              <Textarea
                id="message"
                name="message"
                value={message}
                oninput={(e) => message = e.currentTarget.value}
                required
                rows={3}
                placeholder="Enter notification message (HTML supported: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, etc.)"
              />
              <p class="text-xs text-muted-foreground">
                HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;br&gt; are supported
              </p>
            </div>

            <!-- Action URL (Optional) -->
            <div class="space-y-2">
              <Label for="actionUrl">Action URL (Optional)</Label>
              <Input
                id="actionUrl"
                name="actionUrl"
                type="url"
                value={actionUrl}
                oninput={(e) => actionUrl = e.currentTarget.value}
                placeholder="https://example.com/link"
              />
            </div>

            <!-- Start DateTime (Optional) -->
            <div class="space-y-2">
              <Label for="startDatetime">Start Date & Time (Optional)</Label>
              <Input
                id="startDatetime"
                name="startDatetime"
                type="datetime-local"
                value={startDatetime}
                oninput={(e) => startDatetime = e.currentTarget.value}
              />
              <p class="text-xs text-muted-foreground">
                When notification should start being visible (default: immediately)
              </p>
            </div>

            <!-- End DateTime (Optional) -->
            <div class="space-y-2">
              <Label for="endDatetime">End Date & Time (Optional)</Label>
              <Input
                id="endDatetime"
                name="endDatetime"
                type="datetime-local"
                value={endDatetime}
                oninput={(e) => endDatetime = e.currentTarget.value}
              />
              <p class="text-xs text-muted-foreground">
                When notification should automatically expire (default: never expires)
              </p>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3 pt-4">
              <Button
                type="submit"
                formaction="?/sendGlobalNotification"
                disabled={isSubmitting || !title || !message}
                class="flex-1"
              >
                <Send class="mr-2 h-4 w-4" />
                {#if isSubmitting}
                  Sending...
                {:else}
                  Send to All Users
                {/if}
              </Button>

              <Button
                type="submit"
                formaction="?/sendTestNotification"
                disabled={testSubmitting || !title || !message}
                variant="outline"
                class="flex-1"
              >
                <TestTube class="mr-2 h-4 w-4" />
                {#if testSubmitting}
                  Testing...
                {:else}
                  Test (Send to Me)
                {/if}
              </Button>
            </div>
          </div>
        </form>
      </Card.Content>
    </Card.Root>

    <!-- Info Panel -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Information</Card.Title>
      </Card.Header>
      <Card.Content class="space-y-6">
        <div>
          <h3 class="mb-3 text-sm font-medium">Notification Types</h3>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <Badge variant="outline">System</Badge>
              <span class="text-sm text-muted-foreground">Platform announcements, maintenance</span>
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">Content</Badge>
              <span class="text-sm text-muted-foreground">New videos, updates</span>
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">User</Badge>
              <span class="text-sm text-muted-foreground">User interactions, follows</span>
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">Playlist</Badge>
              <span class="text-sm text-muted-foreground">Playlist changes</span>
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline">Mention</Badge>
              <span class="text-sm text-muted-foreground">User mentions</span>
            </div>
          </div>
        </div>

        <div>
          <h3 class="mb-3 text-sm font-medium">User Stats</h3>
          <p class="text-sm text-muted-foreground">
            Users in system: {data.users.length}
          </p>
        </div>

        <div>
          <h3 class="mb-3 text-sm font-medium">Usage</h3>
          <ul class="space-y-1 text-sm text-muted-foreground">
            <li>• Use "Test" button to preview notifications</li>
            <li>• Action URLs are optional but enhance engagement</li>
            <li>• Notifications appear under the bell icon only</li>
            <li>• Users can remove notifications individually</li>
          </ul>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>
