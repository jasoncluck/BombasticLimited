<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import * as Alert from '$lib/components/ui/alert';
  import { Separator } from '$lib/components/ui/separator';
  import {
    Bell,
    Mail,
    Smartphone,
    AlertCircle,
    User,
    Play,
    AtSign,
    CheckCircle,
  } from '@lucide/svelte';
  import { getNotificationState } from '$lib/state/notifications.svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { NotificationPreferences } from '$lib/supabase/notifications';
  import {
    simulateRealtimeNotification,
    showDemoNotification,
  } from '$lib/utils/demo-notifications';

  let {
    supabase,
  }: {
    supabase: SupabaseClient<Database>;
  } = $props();

  let isLoading = $state(false);
  let saveMessage = $state<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  let localPreferences = $state<NotificationPreferences | null>(null);

  const notificationState = getNotificationState();

  // Initialize and load preferences - only run once when supabase changes
  let preferencesInitializationGuard = $state(false);

  $effect(() => {
    if (supabase && !preferencesInitializationGuard) {
      preferencesInitializationGuard = true;
      notificationState.initialize(supabase);
      loadPreferences();
    }
  });

  // Sync with store
  $effect(() => {
    if (notificationState.preferences && !localPreferences) {
      localPreferences = { ...notificationState.preferences };
    }
  });

  async function loadPreferences() {
    isLoading = true;
    const result = await notificationState.loadPreferences();

    if (result && !result.error && result.data) {
      localPreferences = { ...result.data };
    }

    isLoading = false;
  }

  async function savePreferences() {
    if (!localPreferences) return;

    isLoading = true;
    saveMessage = null;

    const result = await notificationState.updatePreferences({
      system_notifications: localPreferences.system_notifications,
      content_notifications: localPreferences.content_notifications,
      user_notifications: localPreferences.user_notifications,
      playlist_notifications: localPreferences.playlist_notifications,
      mention_notifications: localPreferences.mention_notifications,
      email_notifications: localPreferences.email_notifications,
      push_notifications: localPreferences.push_notifications,
    });

    if (result?.error) {
      saveMessage = {
        type: 'error',
        text: 'Failed to save preferences. Please try again.',
      };
    } else {
      saveMessage = {
        type: 'success',
        text: 'Notification preferences saved successfully!',
      };
      // Clear success message after 3 seconds
      setTimeout(() => {
        saveMessage = null;
      }, 3000);
    }

    isLoading = false;
  }

  function resetToDefaults() {
    if (localPreferences) {
      localPreferences = {
        ...localPreferences,
        system_notifications: true,
        content_notifications: true,
        user_notifications: true,
        playlist_notifications: true,
        mention_notifications: true,
        email_notifications: false,
        push_notifications: false,
      };
    }
  }

  const notificationTypes = [
    {
      key: 'system_notifications' as keyof NotificationPreferences,
      icon: AlertCircle,
      title: 'System Notifications',
      description:
        'Important updates, maintenance notices, and system announcements',
    },
    {
      key: 'content_notifications' as keyof NotificationPreferences,
      icon: Bell,
      title: 'Content Notifications',
      description: 'New videos, content updates, and featured content alerts',
    },
    {
      key: 'user_notifications' as keyof NotificationPreferences,
      icon: User,
      title: 'User Activity',
      description: 'Friend requests, follows, and other user interactions',
    },
    {
      key: 'playlist_notifications' as keyof NotificationPreferences,
      icon: Play,
      title: 'Playlist Updates',
      description: 'Changes to playlists you follow or collaborate on',
    },
    {
      key: 'mention_notifications' as keyof NotificationPreferences,
      icon: AtSign,
      title: 'Mentions',
      description: 'When someone mentions you in comments or discussions',
    },
  ];

  const deliveryMethods = [
    {
      key: 'email_notifications' as keyof NotificationPreferences,
      icon: Mail,
      title: 'Email Notifications',
      description: 'Receive notifications via email (coming soon)',
    },
    {
      key: 'push_notifications' as keyof NotificationPreferences,
      icon: Smartphone,
      title: 'Push Notifications',
      description: 'Browser push notifications (coming soon)',
    },
  ];

  function updatePreference(
    key: keyof NotificationPreferences,
    value: boolean
  ) {
    if (localPreferences) {
      (localPreferences as any)[key] = value;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-semibold tracking-tight">
      Notification Preferences
    </h2>
    <p class="text-muted-foreground">
      Choose which notifications you'd like to receive and how you'd like to
      receive them.
    </p>
  </div>

  {#if saveMessage}
    <Alert.Root
      class={saveMessage.type === 'success'
        ? 'border-green-200 bg-green-50 text-green-800'
        : ''}
    >
      {#if saveMessage.type === 'success'}
        <CheckCircle class="h-4 w-4" />
      {:else}
        <AlertCircle class="h-4 w-4" />
      {/if}
      <Alert.Title
        >{saveMessage.type === 'success' ? 'Success' : 'Error'}</Alert.Title
      >
      <Alert.Description>{saveMessage.text}</Alert.Description>
    </Alert.Root>
  {/if}

  <Card.Root class="p-6">
    <Card.Header class="px-0 pt-0">
      <Card.Title class="flex items-center gap-2">
        <Bell class="h-5 w-5" />
        Notification Types
      </Card.Title>
      <Card.Description>
        Select which types of notifications you want to receive
      </Card.Description>
    </Card.Header>

    <div class="space-y-4">
      {#if localPreferences}
        {#each notificationTypes as type}
          <div
            class="flex items-center justify-between space-x-4 rounded-lg border p-4"
          >
            <div class="flex items-start space-x-3">
              <div class="mt-1">
                {#if type.key === 'system_notifications'}
                  <AlertCircle class="text-muted-foreground h-5 w-5" />
                {:else if type.key === 'content_notifications'}
                  <Bell class="text-muted-foreground h-5 w-5" />
                {:else if type.key === 'user_notifications'}
                  <User class="text-muted-foreground h-5 w-5" />
                {:else if type.key === 'playlist_notifications'}
                  <Play class="text-muted-foreground h-5 w-5" />
                {:else if type.key === 'mention_notifications'}
                  <AtSign class="text-muted-foreground h-5 w-5" />
                {/if}
              </div>
              <div class="space-y-1">
                <Label
                  for={type.key as string}
                  class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {type.title}
                </Label>
                <p class="text-muted-foreground text-sm">
                  {type.description}
                </p>
              </div>
            </div>
            <Switch
              id={type.key as string}
              checked={localPreferences[type.key] as boolean}
              onCheckedChange={(checked) => updatePreference(type.key, checked)}
              disabled={isLoading}
            />
          </div>
        {/each}
      {:else}
        <!-- Loading skeleton -->
        <div class="space-y-4">
          {#each Array(5) as _}
            <div
              class="flex items-center justify-between space-x-4 rounded-lg border p-4"
            >
              <div class="flex items-start space-x-3">
                <div class="bg-muted h-5 w-5 animate-pulse rounded"></div>
                <div class="space-y-2">
                  <div class="bg-muted h-4 w-32 animate-pulse rounded"></div>
                  <div class="bg-muted h-3 w-48 animate-pulse rounded"></div>
                </div>
              </div>
              <div class="bg-muted h-6 w-11 animate-pulse rounded-full"></div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Card.Root>

  <Card.Root class="p-6">
    <Card.Header class="px-0 pt-0">
      <Card.Title class="flex items-center gap-2">
        <Mail class="h-5 w-5" />
        Delivery Methods
      </Card.Title>
      <Card.Description>
        Choose how you'd like to receive notifications
      </Card.Description>
    </Card.Header>

    <div class="space-y-4">
      {#if localPreferences}
        {#each deliveryMethods as method}
          <div
            class="flex items-center justify-between space-x-4 rounded-lg border p-4 {method.key ===
              'email_notifications' || method.key === 'push_notifications'
              ? 'opacity-60'
              : ''}"
          >
            <div class="flex items-start space-x-3">
              <div class="mt-1">
                {#if method.key === 'email_notifications'}
                  <Mail class="text-muted-foreground h-5 w-5" />
                {:else if method.key === 'push_notifications'}
                  <Smartphone class="text-muted-foreground h-5 w-5" />
                {/if}
              </div>
              <div class="space-y-1">
                <Label
                  for={method.key as string}
                  class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {method.title}
                </Label>
                <p class="text-muted-foreground text-sm">
                  {method.description}
                </p>
              </div>
            </div>
            <Switch
              id={method.key as string}
              checked={localPreferences[method.key] as boolean}
              onCheckedChange={(checked) =>
                updatePreference(method.key, checked)}
              disabled={isLoading ||
                method.key === 'email_notifications' ||
                method.key === 'push_notifications'}
            />
          </div>
        {/each}
      {:else}
        <!-- Loading skeleton -->
        <div class="space-y-4">
          {#each Array(2) as _}
            <div
              class="flex items-center justify-between space-x-4 rounded-lg border p-4"
            >
              <div class="flex items-start space-x-3">
                <div class="bg-muted h-5 w-5 animate-pulse rounded"></div>
                <div class="space-y-2">
                  <div class="bg-muted h-4 w-32 animate-pulse rounded"></div>
                  <div class="bg-muted h-3 w-48 animate-pulse rounded"></div>
                </div>
              </div>
              <div class="bg-muted h-6 w-11 animate-pulse rounded-full"></div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Card.Root>

  <Separator />

  <!-- Demo Section (for testing) -->
  <Card.Root class="bg-muted/20 border-dashed p-6">
    <Card.Header class="px-0 pt-0">
      <Card.Title class="flex items-center gap-2 text-sm">
        <Bell class="h-4 w-4" />
        Test Notifications (Demo)
      </Card.Title>
      <Card.Description class="text-sm">
        Test the notification system with demo notifications
      </Card.Description>
    </Card.Header>

    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => showDemoNotification('system')}
      >
        Test System
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => showDemoNotification('content')}
      >
        Test Content
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => showDemoNotification('user')}
      >
        Test User
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => showDemoNotification('playlist_update')}
      >
        Test Playlist
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => showDemoNotification('mention')}
      >
        Test Mention
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={simulateRealtimeNotification}
      >
        Simulate Real-time
      </Button>
    </div>
  </Card.Root>

  <Separator />

  <div
    class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="space-y-1">
      <h3 class="text-lg font-medium">Manage Preferences</h3>
      <p class="text-muted-foreground text-sm">
        Save your changes or reset to default settings
      </p>
    </div>
    <div class="flex gap-2">
      <Button
        variant="outline"
        onclick={resetToDefaults}
        disabled={isLoading || !localPreferences}
      >
        Reset to Defaults
      </Button>
      <Button
        onclick={savePreferences}
        disabled={isLoading || !localPreferences}
      >
        {#if isLoading}
          Saving...
        {:else}
          Save Preferences
        {/if}
      </Button>
    </div>
  </div>
</div>
