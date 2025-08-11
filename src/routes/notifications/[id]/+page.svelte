<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { 
    ArrowLeft, 
    Check, 
    Trash2, 
    ExternalLink,
    AlertCircle,
    Bell,
    User,
    Play,
    AtSign
  } from '@lucide/svelte';
  import { showToast } from '$lib/state/notifications.svelte';

  export let data: PageData;

  $: notification = data.notification;

  function getNotificationIcon(type: string) {
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

  function getNotificationColor(type: string) {
    switch (type) {
      case 'system':
        return 'text-orange-500 bg-orange-100';
      case 'content':
        return 'text-blue-500 bg-blue-100';
      case 'user':
        return 'text-green-500 bg-green-100';
      case 'playlist_update':
        return 'text-purple-500 bg-purple-100';
      case 'mention':
        return 'text-red-500 bg-red-100';
      default:
        return 'text-gray-500 bg-gray-100';
    }
  }

  function formatDateTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function goBack() {
    goto('/');
  }
</script>

<svelte:head>
  <title>Notification: {notification.title} | Bombastic</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
  <!-- Header -->
  <div class="mb-6 flex items-center gap-4">
    <Button variant="outline" size="sm" onclick={goBack}>
      <ArrowLeft class="mr-2 h-4 w-4" />
      Back
    </Button>
    <h1 class="text-2xl font-bold">Notification Details</h1>
  </div>

  <Card.Root>
    <Card.Header class="pb-4">
      <div class="flex items-start gap-4">
        <!-- Icon -->
        <div class="flex-shrink-0">
          <div class="h-12 w-12 rounded-full flex items-center justify-center {getNotificationColor(notification.type)}">
            <svelte:component this={getNotificationIcon(notification.type)} class="h-6 w-6" />
          </div>
          {#if !notification.read}
            <div class="absolute -mt-2 -ml-2 h-4 w-4 rounded-full bg-blue-500"></div>
          {/if}
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-xl font-semibold mb-2 {!notification.read ? 'font-bold' : ''}">{notification.title}</h2>
              <div class="flex items-center gap-2 mb-4">
                <Badge variant="outline" class="text-xs">
                  {notification.type.replace('_', ' ')}
                </Badge>
                {#if !notification.read}
                  <Badge variant="default" class="text-xs">Unread</Badge>
                {/if}
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              {#if !notification.read}
                <form method="POST" action="?/markAsRead" use:enhance={() => {
                  return async ({ result, update }) => {
                    await update();
                    if (result.type === 'success') {
                      showToast('Notification marked as read', 'success');
                    }
                  };
                }}>
                  <Button variant="outline" size="sm" type="submit">
                    <Check class="mr-2 h-4 w-4" />
                    Mark as Read
                  </Button>
                </form>
              {/if}

              <form method="POST" action="?/deleteNotification" use:enhance={() => {
                return async ({ result, update }) => {
                  if (result.type === 'success') {
                    showToast('Notification deleted', 'success');
                  } else {
                    await update();
                  }
                };
              }}>
                <Button variant="destructive" size="sm" type="submit">
                  <Trash2 class="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Card.Header>

    <Card.Content>
      <!-- Message Content -->
      <div class="prose prose-sm max-w-none mb-6">
        {@html notification.message}
      </div>

      <!-- Action URL -->
      {#if notification.action_url}
        <div class="mb-6">
          <Button variant="outline" onclick={() => notification.action_url && goto(notification.action_url)}>
            <ExternalLink class="mr-2 h-4 w-4" />
            Go to Link
          </Button>
        </div>
      {/if}

      <!-- Metadata -->
      <div class="border-t pt-4 space-y-2 text-sm text-muted-foreground">
        <div>
          <strong>Created:</strong> {formatDateTime(notification.created_at)}
        </div>
        {#if notification.updated_at !== notification.created_at}
          <div>
            <strong>Updated:</strong> {formatDateTime(notification.updated_at)}
          </div>
        {/if}
        {#if notification.metadata && Object.keys(notification.metadata).length > 0}
          <div>
            <strong>Source:</strong> {(notification.metadata as any)?.source || 'system'}
          </div>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</div>

<style>
  /* Prose styles for HTML content */
  :global(.prose b, .prose strong) {
    font-weight: 600;
  }
  
  :global(.prose i, .prose em) {
    font-style: italic;
  }
  
  :global(.prose u) {
    text-decoration: underline;
  }
  
  :global(.prose br) {
    margin: 0.5em 0;
  }
</style>