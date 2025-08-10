<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import NotificationPreferences from '$lib/components/notifications/notification-preferences.svelte';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();
  const { session, supabase } = $derived(data);
</script>

<svelte:head>
  <title>Notification Settings - Bombastic</title>
  <meta
    name="description"
    content="Manage your notification preferences and settings"
  />
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
  <!-- Header with back button -->
  <div class="mb-8 flex items-center gap-4">
    <Button
      variant="ghost"
      size="sm"
      onclick={() => goto('/account')}
      class="flex items-center gap-2"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to Account
    </Button>
  </div>

  <!-- Main content -->
  <NotificationPreferences {supabase} />
</div>
