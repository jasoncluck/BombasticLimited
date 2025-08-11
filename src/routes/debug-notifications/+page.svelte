<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { createNotificationService } from '$lib/services/notification-service';
  import { getNotificationState } from '$lib/state/notifications.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
  const { supabase, session } = data;

  let debugInfo = $state({
    userAuthenticated: false,
    userId: '',
    notificationsCount: 0,
    unreadCount: 0,
    serviceInitialized: false,
    stateInitialized: false,
    lastError: '',
    notifications: [],
    preferences: null,
    testNotificationResult: ''
  });

  const notificationState = getNotificationState();

  onMount(async () => {
    console.log('🧪 Starting notification debug...');
    
    try {
      // Check authentication
      const user = await supabase.auth.getUser();
      debugInfo.userAuthenticated = !!user.data.user;
      debugInfo.userId = user.data.user?.id || '';
      
      console.log('User authenticated:', debugInfo.userAuthenticated);
      console.log('User ID:', debugInfo.userId);

      if (user.data.user) {
        // Test notification service
        const service = createNotificationService(supabase);
        debugInfo.serviceInitialized = true;

        // Test getting notifications
        console.log('Testing getNotifications...');
        const notificationsResult = await service.getNotifications();
        console.log('Notifications result:', notificationsResult);
        
        if (notificationsResult.error) {
          debugInfo.lastError = notificationsResult.error.message || 'Unknown error';
        } else {
          debugInfo.notifications = notificationsResult.data || [];
          debugInfo.notificationsCount = debugInfo.notifications.length;
        }

        // Test getting unread count
        console.log('Testing getUnreadCount...');
        const unreadResult = await service.getUnreadCount();
        console.log('Unread result:', unreadResult);
        
        if (unreadResult.error) {
          debugInfo.lastError = unreadResult.error.message || 'Unknown error';
        } else {
          debugInfo.unreadCount = unreadResult.data || 0;
        }

        // Test getting preferences
        console.log('Testing getNotificationPreferences...');
        const preferencesResult = await service.getNotificationPreferences();
        console.log('Preferences result:', preferencesResult);
        debugInfo.preferences = preferencesResult.data;

        // Test notification state
        console.log('Testing notification state...');
        notificationState.initialize(supabase);
        debugInfo.stateInitialized = true;
        
        await notificationState.loadNotifications();
        await notificationState.loadUnreadCount();
      }
    } catch (error) {
      console.error('Debug error:', error);
      debugInfo.lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  });

  async function testCreateNotification() {
    if (!session?.user?.id) {
      debugInfo.testNotificationResult = 'Error: No user session';
      return;
    }

    try {
      const service = createNotificationService(supabase);
      const result = await service.createNotification({
        user_id: session.user.id,
        type: 'system',
        title: 'Debug Test Notification',
        message: 'This is a test notification created from the debug page.',
        metadata: { source: 'debug_page' },
        action_url: '/debug-notifications'
      });

      if (result.error) {
        debugInfo.testNotificationResult = `Error: ${result.error.message || 'Unknown error'}`;
      } else {
        debugInfo.testNotificationResult = `Success: Created notification with ID ${result.data}`;
        
        // Refresh the data
        const notificationsResult = await service.getNotifications();
        debugInfo.notifications = notificationsResult.data || [];
        debugInfo.notificationsCount = debugInfo.notifications.length;
        
        const unreadResult = await service.getUnreadCount();
        debugInfo.unreadCount = unreadResult.data || 0;
      }
    } catch (error) {
      debugInfo.testNotificationResult = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async function testRPCFunction() {
    if (!session?.user?.id) {
      debugInfo.testNotificationResult = 'Error: No user session';
      return;
    }

    try {
      console.log('Testing RPC function directly...');
      const { data, error } = await supabase.rpc('get_unread_notification_count', {
        target_user_id: session.user.id
      });

      if (error) {
        debugInfo.testNotificationResult = `RPC Error: ${error.message}`;
        console.error('RPC Error:', error);
      } else {
        debugInfo.testNotificationResult = `RPC Success: Unread count = ${data}`;
        console.log('RPC Success:', data);
      }
    } catch (error) {
      debugInfo.testNotificationResult = `RPC Exception: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('RPC Exception:', error);
    }
  }
</script>

<svelte:head>
  <title>Debug Notifications | Bombastic</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6">Notification System Debug</h1>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Authentication Info -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Authentication Status</h2>
      <ul class="space-y-2">
        <li class="flex justify-between">
          <span>User Authenticated:</span>
          <span class={debugInfo.userAuthenticated ? 'text-green-600' : 'text-red-600'}>
            {debugInfo.userAuthenticated ? '✅ Yes' : '❌ No'}
          </span>
        </li>
        <li class="flex justify-between">
          <span>User ID:</span>
          <span class="font-mono text-sm">{debugInfo.userId || 'N/A'}</span>
        </li>
      </ul>
    </div>

    <!-- Service Status -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Service Status</h2>
      <ul class="space-y-2">
        <li class="flex justify-between">
          <span>Service Initialized:</span>
          <span class={debugInfo.serviceInitialized ? 'text-green-600' : 'text-red-600'}>
            {debugInfo.serviceInitialized ? '✅ Yes' : '❌ No'}
          </span>
        </li>
        <li class="flex justify-between">
          <span>State Initialized:</span>
          <span class={debugInfo.stateInitialized ? 'text-green-600' : 'text-red-600'}>
            {debugInfo.stateInitialized ? '✅ Yes' : '❌ No'}
          </span>
        </li>
      </ul>
    </div>

    <!-- Notification Counts -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Notification Counts</h2>
      <ul class="space-y-2">
        <li class="flex justify-between">
          <span>Total Notifications:</span>
          <span class="font-semibold">{debugInfo.notificationsCount}</span>
        </li>
        <li class="flex justify-between">
          <span>Unread Count:</span>
          <span class="font-semibold">{debugInfo.unreadCount}</span>
        </li>
        <li class="flex justify-between">
          <span>State Notifications:</span>
          <span class="font-semibold">{notificationState.notifications.length}</span>
        </li>
        <li class="flex justify-between">
          <span>State Unread:</span>
          <span class="font-semibold">{notificationState.unreadCount}</span>
        </li>
      </ul>
    </div>

    <!-- Error Info -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Error Information</h2>
      {#if debugInfo.lastError}
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {debugInfo.lastError}
        </div>
      {:else}
        <div class="text-green-600">No errors detected</div>
      {/if}
    </div>
  </div>

  <!-- Test Actions -->
  <div class="mt-8 bg-white shadow-lg rounded-lg p-6">
    <h2 class="text-xl font-semibold mb-4">Test Actions</h2>
    <div class="flex flex-wrap gap-4 mb-4">
      <button 
        class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onclick={testCreateNotification}
      >
        Create Test Notification
      </button>
      <button 
        class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        onclick={testRPCFunction}
      >
        Test RPC Function
      </button>
    </div>
    
    {#if debugInfo.testNotificationResult}
      <div class="mt-4 p-4 bg-gray-100 rounded">
        <strong>Test Result:</strong> {debugInfo.testNotificationResult}
      </div>
    {/if}
  </div>

  <!-- Notifications List -->
  {#if debugInfo.notifications.length > 0}
    <div class="mt-8 bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Raw Notifications Data</h2>
      <div class="space-y-2">
        {#each debugInfo.notifications as notification}
          <div class="border rounded p-3">
            <div class="font-semibold">{notification.title}</div>
            <div class="text-sm text-gray-600">{notification.message}</div>
            <div class="text-xs text-gray-500 mt-1">
              Type: {notification.type} | Read: {notification.read} | Created: {notification.created_at}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Preferences -->
  {#if debugInfo.preferences}
    <div class="mt-8 bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Notification Preferences</h2>
      <ul class="space-y-1">
        <li>System: {debugInfo.preferences.system_notifications ? '✅' : '❌'}</li>
        <li>Content: {debugInfo.preferences.content_notifications ? '✅' : '❌'}</li>
        <li>User: {debugInfo.preferences.user_notifications ? '✅' : '❌'}</li>
        <li>Playlist: {debugInfo.preferences.playlist_notifications ? '✅' : '❌'}</li>
        <li>Mention: {debugInfo.preferences.mention_notifications ? '✅' : '❌'}</li>
      </ul>
    </div>
  {/if}
</div>