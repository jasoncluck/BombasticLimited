<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Select from '$lib/components/ui/select';
  import * as Card from '$lib/components/ui/card';
  import * as Form from '$lib/components/ui/form';
  import { Send, TestTube, RotateCcw, Loader } from '@lucide/svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import type { NotificationType } from '$lib/supabase/notifications';
  import {
    notificationTemplates,
    notificationTypes,
  } from './notification-templates';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import {
    getTimezoneInfo,
    localToUtcDateTime,
    utcToLocalDateTime,
  } from '$lib/utils/datetime';
  import { showToast } from '$lib/state/notifications.svelte';
  import {
    adminNotificationSchema,
    type AdminNotificationSchema,
  } from '$lib/schema/admin-notification-schema';

  let {
    form,
    onSuccess,
  }: {
    form: SuperValidated<AdminNotificationSchema>;
    onSuccess?: () => void;
  } = $props();

  let isSubmitting = $state(false);
  let testSubmitting = $state(false);
  let currentAction = $state<string>('');

  const adminNotificationForm = superForm(form, {
    resetForm: false, // Don't reset form automatically
    invalidateAll: false, // Don't invalidate all data
    validators: zodClient(adminNotificationSchema),
    validationMethod: 'onsubmit',

    onSubmit({ formData }) {
      const action = formData.get('_action')?.toString() || '';
      currentAction = action;

      // Convert local datetime inputs to UTC before submitting
      const startDatetime = formData.get('startDatetime')?.toString();
      const endDatetime = formData.get('endDatetime')?.toString();

      if (startDatetime) {
        const utcStart = localToUtcDateTime(startDatetime);
        if (utcStart) {
          formData.set('startDatetime', utcStart);
        }
      }

      if (endDatetime) {
        const utcEnd = localToUtcDateTime(endDatetime);
        if (utcEnd) {
          formData.set('endDatetime', utcEnd);
        }
      }

      if (action === 'sendTestNotification') {
        testSubmitting = true;
      } else {
        isSubmitting = true;
      }
    },

    onResult(event) {
      // Don't reset currentAction here - wait for onUpdated
      if (event.result.type !== 'redirect') {
        if (currentAction === 'sendTestNotification') {
          testSubmitting = false;
        } else {
          isSubmitting = false;
        }
      }
    },

    onUpdated({ form }) {
      console.log(form.data);
      if (form.valid) {
        if (currentAction === 'sendTestNotification') {
          showToast('✅ Test notification sent successfully!', 'success');
          // Don't clear form for test notifications - keep values for refinement
        } else if (currentAction === 'sendGlobalNotification') {
          showToast(`✅ Global notification sent successfully!`, 'success');
        } else {
          // Fallback if currentAction is somehow empty
          showToast('✅ Notification sent successfully!', 'success');
        }

        // Call success callback if provided
        if (onSuccess) {
          onSuccess();
        }
      } else if (form.errors) {
        const errorMessages = Object.values(form.errors).flat();
        if (errorMessages.length > 0) {
          showToast(`❌ Error: ${errorMessages[0]}`, 'error');
        }
      }

      // Reset currentAction after handling the response
      currentAction = '';
    },
  });

  let selectedType = $state({ value: 'system', label: 'System' });

  const { form: formData, enhance } = adminNotificationForm;

  function loadTemplate(templateName: keyof typeof notificationTemplates) {
    const template = notificationTemplates[templateName];
    selectedType =
      notificationTypes.find((t) => t.value === template.type) ||
      notificationTypes[0];

    $formData.type = template.type;
    $formData.title = template.title;
    $formData.message = template.message;
  }

  function resetForm() {
    selectedType = notificationTypes[0];
    $formData.type = 'system';
    $formData.title = '';
    $formData.message = '';
    $formData.startDatetime = '';
    $formData.endDatetime = '';
  }

  // Get current timezone info for display
  const timezoneInfo = getTimezoneInfo();

  // Sync selectedType with form data
  $effect(() => {
    if (form && $formData.type) {
      selectedType =
        notificationTypes.find((t) => t.value === $formData.type) ||
        notificationTypes[0];
    }
  });

  // Local state for datetime inputs (in datetime-local format)
  let localStartDatetime = $state('');
  let localEndDatetime = $state('');

  // Sync form data with local datetime inputs
  $effect(() => {
    if ($formData.startDatetime) {
      localStartDatetime = utcToLocalDateTime($formData.startDatetime);
    }
    if ($formData.endDatetime) {
      localEndDatetime = utcToLocalDateTime($formData.endDatetime);
    }
  });

  // Update form data when local inputs change
  function handleStartDatetimeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    localStartDatetime = target.value;
    $formData.startDatetime = target.value; // Store as local datetime for form validation
  }

  function handleEndDatetimeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    localEndDatetime = target.value;
    $formData.endDatetime = target.value; // Store as local datetime for form validation
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-lg sm:text-xl">Create Notification</Card.Title>
    <p class="text-muted-foreground text-sm">
      Your timezone: {timezoneInfo.timezoneName} ({timezoneInfo.abbreviation})
    </p>
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
          class="text-xs sm:text-sm"
        >
          Welcome
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={() => loadTemplate('feature')}
          class="text-xs sm:text-sm"
        >
          New Feature
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={() => loadTemplate('maintenance')}
          class="text-xs sm:text-sm"
        >
          Maintenance
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={() => loadTemplate('announcement')}
          class="text-xs sm:text-sm"
        >
          Announcement
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={resetForm}
          class="text-xs sm:text-sm"
        >
          <RotateCcw class="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
          Clear
        </Button>
      </div>
    </div>

    <form method="POST" use:enhance>
      <div class="space-y-4 sm:space-y-6">
        <!-- Type Selection -->
        <Form.Field form={adminNotificationForm} name="type">
          <Form.Control>
            {#snippet children({ props })}
              <Label for="type" class="text-sm">Type</Label>
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
                <Select.Trigger class="w-full">
                  {selectedType?.label || 'Select notification type'}
                </Select.Trigger>
                <Select.Content>
                  {#each notificationTypes as type (type.value)}
                    <Select.Item value={type.value}>{type.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <input type="hidden" name="type" bind:value={$formData.type} />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <!-- Title -->
        <Form.Field form={adminNotificationForm} name="title">
          <Form.Control>
            {#snippet children({ props })}
              <Label for="title" class="text-sm">Title</Label>
              <Input
                {...props}
                id="title"
                name="title"
                type="text"
                bind:value={$formData.title}
                required
                placeholder="Enter notification title"
                class="w-full"
              />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <!-- Message -->
        <Form.Field form={adminNotificationForm} name="message">
          <Form.Control>
            {#snippet children({ props })}
              <Label for="message" class="text-sm">Message</Label>
              <Textarea
                {...props}
                id="message"
                name="message"
                bind:value={$formData.message}
                required
                rows={4}
                placeholder="Enter notification message (HTML supported)"
                class="w-full resize-none"
              />
              <p class="text-muted-foreground mt-1 text-xs">
                HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;br&gt;,
                &lt;a href="..."&gt; are supported
              </p>
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <!-- Start DateTime -->
        <Form.Field form={adminNotificationForm} name="startDatetime">
          <Form.Control>
            {#snippet children({ props })}
              <div class="space-y-2">
                <Label for="startDatetime" class="text-sm"
                  >Start Date & Time (Optional)</Label
                >

                <input
                  {...props}
                  id="startDatetime"
                  name="startDatetime"
                  type="datetime-local"
                  value={localStartDatetime}
                  onchange={handleStartDatetimeChange}
                  class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:outline-hiddden flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p class="text-muted-foreground text-xs">
                  Enter time in your local timezone ({timezoneInfo.abbreviation})
                </p>
              </div>
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <!-- End DateTime -->
        <Form.Field form={adminNotificationForm} name="endDatetime">
          <Form.Control>
            {#snippet children({ props })}
              <div class="space-y-2">
                <Label for="endDatetime" class="text-sm"
                  >End Date & Time (Optional)</Label
                >

                <input
                  {...props}
                  id="endDatetime"
                  name="endDatetime"
                  type="datetime-local"
                  value={localEndDatetime}
                  onchange={handleEndDatetimeChange}
                  class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:outline-hiddden flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />

                <p class="text-muted-foreground text-xs">
                  When notification should automatically expire ({timezoneInfo.abbreviation})
                </p>

                {#if !localEndDatetime}
                  <p class="text-muted-foreground text-xs">
                    Leave empty for notifications that never expire
                  </p>
                {/if}
              </div>
            {/snippet}
          </Form.Control>
          <Form.FieldErrors class="text-xs" />
        </Form.Field>

        <!-- Action Buttons -->
        <div class="flex flex-col gap-3 pt-4 sm:flex-row">
          <!-- Test Button - Primary -->
          <Button
            type="submit"
            formaction="?/sendTestNotification"
            disabled={testSubmitting || !$formData.title || !$formData.message}
            class="flex-1"
          >
            {#if testSubmitting}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
              Testing...
            {:else}
              <TestTube class="mr-2 h-4 w-4" />
              <span class="hidden sm:inline">Test (Send to Me)</span>
              <span class="sm:hidden">Test</span>
            {/if}
          </Button>

          <!-- Send to All Button - Secondary -->
          <Button
            type="submit"
            formaction="?/sendGlobalNotification"
            disabled={isSubmitting || !$formData.title || !$formData.message}
            variant="outline"
            class="flex-1"
          >
            {#if isSubmitting}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
              Sending...
            {:else}
              <Send class="mr-2 h-4 w-4" />
              <span class="hidden sm:inline">Send to All Users</span>
              <span class="sm:hidden">Send to All</span>
            {/if}
          </Button>
        </div>
      </div>
    </form>
  </Card.Content>
</Card.Root>
