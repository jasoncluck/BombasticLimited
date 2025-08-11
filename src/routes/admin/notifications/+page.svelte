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

  export let data: PageData;
  export let form: ActionData;

  let isSubmitting = false;
  let testSubmitting = false;

  const notificationTypes = [
    { value: 'system', label: 'System' },
    { value: 'content', label: 'Content' },
    { value: 'user', label: 'User' },
    { value: 'playlist_update', label: 'Playlist Update' },
    { value: 'mention', label: 'Mention' },
  ];

  let selectedType = { value: 'system', label: 'System' };
  let title = '';
  let message = '';
  let actionUrl = '';

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
    title = template.title;
    message = template.message;
    actionUrl = template.actionUrl;
  }

  function resetForm() {
    selectedType = notificationTypes[0];
    title = '';
    message = '';
    actionUrl = '';
  }
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

  <!-- Result Messages -->
  {#if form?.success}
    <Card.Root class="mb-6 border-green-200 bg-green-50">
      <Card.Content class="p-4">
        <div class="flex items-center gap-2 text-green-700">
          {#if form.count !== undefined}
            ✅ Global notification sent successfully to {form.count} users!
          {:else}
            ✅ Test notification sent successfully!
          {/if}
        </div>
      </Card.Content>
    </Card.Root>
  {:else if form?.error}
    <Card.Root class="mb-6 border-red-200 bg-red-50">
      <Card.Content class="p-4">
        <div class="flex items-center gap-2 text-red-700">
          ❌ Error: {form.error}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}

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
              <Select.Root bind:selected={selectedType}>
                <Select.Trigger>
                  <Select.Value placeholder="Select notification type" />
                </Select.Trigger>
                <Select.Content>
                  {#each notificationTypes as type}
                    <Select.Item value={type.value}>{type.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <input type="hidden" name="type" value={selectedType?.value || 'system'} />
            </div>

            <!-- Title -->
            <div class="space-y-2">
              <Label for="title">Title</Label>
              <Input
                id="title"
                name="title"
                type="text"
                bind:value={title}
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
                bind:value={message}
                required
                rows={3}
                placeholder="Enter notification message"
              />
            </div>

            <!-- Action URL (Optional) -->
            <div class="space-y-2">
              <Label for="actionUrl">Action URL (Optional)</Label>
              <Input
                id="actionUrl"
                name="actionUrl"
                type="url"
                bind:value={actionUrl}
                placeholder="https://example.com/link"
              />
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
