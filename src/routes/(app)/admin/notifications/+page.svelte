<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { showToast } from '$lib/state/notifications.svelte';
  import { getNavigationState } from '$lib/state/navigation.svelte';
  import NotificationForm from '$lib/components/admin/notification-form.svelte';
  import NotificationInfoPanel from '$lib/components/admin/notification-info-panel.svelte';
  import NotificationList from '$lib/components/admin/notification-list.svelte';
  import { updateFlash } from 'sveltekit-flash-message';
  import { page } from '$app/state';

  let { data } = $props();

  const navigationState = getNavigationState();

  let manualCleanupSubmitting = $state(false);
  let cancellingId = $state<number | null>(null);

  // Cleanup references for intervals
  let refreshInterval: number | null = null;

  // Separate state for admin notifications (independent of form)
  let adminNotifications = $state({
    pending: [],
    sent: [],
    expired: [],
    systemLogs: [],
    loading: false,
    lastRefresh: 0,
  });

  // Function to clean up intervals
  function cleanupIntervals() {
    console.log('🧹 Cleaning up admin notification intervals');
    if (refreshInterval !== null) {
      window.clearInterval(refreshInterval);
      refreshInterval = null;
      console.log('   ✓ Refresh interval cleared');
    }
  }

  // Function to refresh admin notification data
  async function refreshAdminNotifications() {
    if (adminNotifications.loading) {
      console.log('⏭️ Skipping refresh - already loading');
      return;
    }

    console.log(
      '🔄 Starting admin notifications refresh at',
      new Date().toISOString()
    );
    adminNotifications.loading = true;

    try {
      const response = await fetch('/api/admin/notifications');

      if (response.ok) {
        const apiData = await response.json();

        // Update the admin notifications state
        adminNotifications.pending = apiData.pendingNotifications;
        adminNotifications.sent = apiData.sentNotifications;
        adminNotifications.expired = apiData.expiredNotifications;
        adminNotifications.systemLogs = apiData.systemLogs;
        adminNotifications.lastRefresh = Date.now();

        console.log('✅ Admin notifications refreshed successfully:', {
          pending: apiData.pendingNotifications.length,
          sent: apiData.sentNotifications.length,
          expired: apiData.expiredNotifications.length,
          timestamp: apiData.timestamp,
          user: 'admin',
          currentTime: '2025-08-13 21:36:57 UTC',
        });
      } else {
        console.error(
          '❌ Failed to refresh admin notifications:',
          response.status
        );
        showToast('Failed to refresh notifications', 'error');
      }
    } catch (error) {
      console.error('❌ Error refreshing admin notifications:', error);
      showToast('Error refreshing notifications', 'error');
    } finally {
      adminNotifications.loading = false;
      console.log('🏁 Admin notifications refresh completed');
    }
  }

  // Auto-refresh notifications every 30 seconds
  onMount(() => {
    refreshAdminNotifications();

    refreshInterval = window.setInterval(() => {
      // Only refresh if tab is visible and not already loading
      if (!document.hidden && !adminNotifications.loading) {
        console.log('🔄 Auto-refreshing notifications (30s interval)');
        refreshAdminNotifications();
      }
    }, 30000);

    return () => {
      if (refreshInterval !== null) {
        window.clearInterval(refreshInterval);
        refreshInterval = null;
      }
    };
  });

  // Clean up intervals when component is destroyed
  onDestroy(() => {
    console.log('🗑️ Admin notifications page destroyed - cleaning up');
    cleanupIntervals();
  });

  async function cancelNotification(notificationId: number) {
    const formData = new FormData();
    formData.append('notificationId', notificationId.toString());

    const response = await fetch('?/cancelNotification', {
      method: 'POST',
      body: formData,
    });

    // SvelteKit form actions return different format
    const result = await response.json();

    if (response.ok && result.type === 'success') {
      showToast('Notification canceled successfully', 'success');

      // Check if we should refresh (will be in result.data)

      navigationState.refreshData();
    } else {
      // Handle error - message will be in result.data.error or result.error
      const errorMessage =
        result.data?.error || result.error || 'Failed to cancel notification';
      console.error(
        '❌ Failed to cancel notification:',
        response.status,
        errorMessage
      );
      showToast(errorMessage, 'error');
    }

    refreshAdminNotifications();
  }

  async function triggerManualCleanup() {
    if (manualCleanupSubmitting) {
      console.log('⏭️ Manual cleanup already in progress, skipping');
      return;
    }

    console.log('🧹 Starting manual cleanup');
    manualCleanupSubmitting = true;

    try {
      const response = await fetch('?/manualCleanup', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        const deletedCount = result.deletedCount || 0;
        showToast(
          `Manual cleanup completed. Removed ${deletedCount} expired notifications.`,
          'success'
        );
        console.log('✅ Manual cleanup completed, deleted:', deletedCount);

        // Refresh admin notifications if action was successful
        if (result.shouldRefreshNotifications) {
          await refreshAdminNotifications();
        }

        // Also refresh user notifications in navigation state
        navigationState.refreshData();
      } else {
        console.error('❌ Failed manual cleanup:', response.status);
        showToast('Failed to cleanup expired notifications', 'error');
      }
    } catch (error) {
      console.error('❌ Error during manual cleanup:', error);
      showToast('Error during manual cleanup', 'error');
    } finally {
      manualCleanupSubmitting = false;
      console.log('🏁 Manual cleanup completed');
    }
  }

  // Handle successful form submissions
  async function handleFormSuccess() {
    console.log('📝 Form submission successful - refreshing data');
    await refreshAdminNotifications();
    navigationState.refreshData();
  }
</script>

<svelte:head>
  <title>Admin - Notification Management | Bombastic</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8">
  <!-- Header -->
  <div class="mb-6 sm:mb-8">
    <h1 class="mb-2 text-2xl font-bold sm:text-3xl">Notification Management</h1>
    <p class="text-muted-foreground text-sm sm:text-base">
      Send notifications to all users or test notifications
    </p>
  </div>

  <!-- Top Section: Form and Info -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:gap-8">
    <NotificationForm form={data.form} onSuccess={handleFormSuccess} />

    <NotificationInfoPanel
      users={data.users}
      systemLogs={adminNotifications.systemLogs}
      {manualCleanupSubmitting}
      onManualCleanup={triggerManualCleanup}
    />
  </div>

  <NotificationList
    pendingNotifications={adminNotifications.pending}
    sentNotifications={adminNotifications.sent}
    expiredNotifications={adminNotifications.expired}
    {cancellingId}
    onCancelNotification={cancelNotification}
  />
</div>
