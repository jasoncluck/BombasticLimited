<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Select from '$lib/components/ui/select';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Send, TestTube, RotateCcw, Loader } from '@lucide/svelte';
  import { showToast } from '$lib/state/notifications.svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { zodClient, type Infer } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import { writable } from 'svelte/store';
  import {
    adminNotificationSchema,
    type AdminNotificationSchema,
  } from './admin-notifications-schema';
  import users from '@lucide/svelte/icons/users';
  import type { NotificationType } from '$lib/supabase/notifications';

  let {
    data,
  }: { data: { form: SuperValidated<Infer<AdminNotificationSchema>> } } =
    $props();

  let currentAction = $state<string>('');

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
    },
  });

  let isSubmitting = $state(false);
  let testSubmitting = $state(false);

  const { form: formData, enhance } = notificationForm || {
    form: writable({
      type: 'system',
      title: '',
      message: '',
      startDatetime: '',
      endDatetime: '',
    }),
    enhance: () => ({ destroy: () => {} }),
  };

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
      title: 'Welcome to Bombastic!',
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
                    <Label for="startDatetime"
                      >Start Date & Time (Optional)</Label
                    >
                    <Input
                      {...props}
                      id="startDatetime"
                      name="startDatetime"
                      type="datetime-local"
                      bind:value={$formData.startDatetime}
                    />
                    <p class="text-muted-foreground text-xs">
                      When notification should start being visible (default:
                      immediately)
                    </p>
                  {/snippet}
                </Form.Control>
                <Form.FieldErrors class="text-xs" />
              </Form.Field>

              <!-- End DateTime (Optional) -->
              <Form.Field form={notificationForm} name="endDatetime">
                <Form.Control>
                  {#snippet children({ props })}
                    <Label for="endDatetime">End Date & Time (Optional)</Label>
                    <Input
                      {...props}
                      id="endDatetime"
                      name="endDatetime"
                      type="datetime-local"
                      bind:value={$formData.endDatetime}
                    />
                    <p class="text-muted-foreground text-xs">
                      When notification should automatically expire (default:
                      never expires)
                    </p>
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
        <Card.Title>Information</Card.Title>
      </Card.Header>
      <Card.Content class="space-y-6">
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
            Users in system: {users.length}
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
          </ul>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>
