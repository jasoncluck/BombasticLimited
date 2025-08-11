<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let isSubmitting = false;
  let testSubmitting = false;

  const notificationTypes = [
    { value: 'system', label: 'System' },
    { value: 'content', label: 'Content' },
    { value: 'user', label: 'User' },
    { value: 'playlist_update', label: 'Playlist Update' },
    { value: 'mention', label: 'Mention' }
  ];

  let selectedType = 'system';
  let title = '';
  let message = '';
  let actionUrl = '';

  // Predefined templates
  const templates = {
    welcome: {
      type: 'system',
      title: 'Welcome to Bombastic!',
      message: 'Thanks for being part of our community! Explore playlists and discover great content.',
      actionUrl: '/account/notifications'
    },
    feature: {
      type: 'system',
      title: 'New Feature Released!',
      message: 'Check out our enhanced playlist features and improved user experience.',
      actionUrl: '/features'
    },
    maintenance: {
      type: 'system',
      title: 'Scheduled Maintenance',
      message: 'We will be performing maintenance tonight from 2-4 AM EST. Some features may be temporarily unavailable.',
      actionUrl: ''
    }
  };

  function loadTemplate(templateName: keyof typeof templates) {
    const template = templates[templateName];
    selectedType = template.type;
    title = template.title;
    message = template.message;
    actionUrl = template.actionUrl;
  }

  function resetForm() {
    selectedType = 'system';
    title = '';
    message = '';
    actionUrl = '';
  }
</script>

<svelte:head>
  <title>Admin - Notification Management | Bombastic</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold mb-2">Notification Management</h1>
    <p class="text-gray-600">Send notifications to all users or test notifications</p>
  </div>

  <!-- Result Messages -->
  {#if form?.success}
    <div class="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
      {#if form.count !== undefined}
        ✅ Global notification sent successfully to {form.count} users!
      {:else}
        ✅ Test notification sent successfully!
      {/if}
    </div>
  {:else if form?.error}
    <div class="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
      ❌ Error: {form.error}
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Notification Form -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Create Notification</h2>

      <!-- Template Buttons -->
      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Quick Templates:</h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            onclick={() => loadTemplate('welcome')}
          >
            Welcome
          </button>
          <button
            type="button"
            class="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
            onclick={() => loadTemplate('feature')}
          >
            New Feature
          </button>
          <button
            type="button"
            class="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
            onclick={() => loadTemplate('maintenance')}
          >
            Maintenance
          </button>
          <button
            type="button"
            class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            onclick={resetForm}
          >
            Clear
          </button>
        </div>
      </div>

      <form method="POST" use:enhance={() => {
        isSubmitting = true;
        return async ({ update }) => {
          await update();
          isSubmitting = false;
        };
      }}>
        <div class="space-y-4">
          <!-- Type Selection -->
          <div>
            <label for="type" class="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              id="type"
              name="type"
              bind:value={selectedType}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {#each notificationTypes as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </select>
          </div>

          <!-- Title -->
          <div>
            <label for="title" class="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              bind:value={title}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter notification title"
            />
          </div>

          <!-- Message -->
          <div>
            <label for="message" class="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              bind:value={message}
              required
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter notification message"
            ></textarea>
          </div>

          <!-- Action URL (Optional) -->
          <div>
            <label for="actionUrl" class="block text-sm font-medium text-gray-700 mb-1">
              Action URL (Optional)
            </label>
            <input
              id="actionUrl"
              name="actionUrl"
              type="url"
              bind:value={actionUrl}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/link"
            />
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-4">
            <button
              type="submit"
              formaction="?/sendGlobalNotification"
              disabled={isSubmitting || !title || !message}
              class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if isSubmitting}
                Sending...
              {:else}
                Send to All Users
              {/if}
            </button>

            <button
              type="submit"
              formaction="?/sendTestNotification"
              disabled={testSubmitting || !title || !message}
              class="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if testSubmitting}
                Testing...
              {:else}
                Test (Send to Me)
              {/if}
            </button>
          </div>
        </div>
      </form>
    </div>

    <!-- Info Panel -->
    <div class="bg-white shadow-lg rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Information</h2>
      
      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-2">Notification Types:</h3>
          <ul class="text-sm text-gray-600 space-y-1">
            <li><strong>System:</strong> Platform announcements, maintenance</li>
            <li><strong>Content:</strong> New videos, updates</li>
            <li><strong>User:</strong> User interactions, follows</li>
            <li><strong>Playlist Update:</strong> Playlist changes</li>
            <li><strong>Mention:</strong> User mentions</li>
          </ul>
        </div>

        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-2">User Stats:</h3>
          <p class="text-sm text-gray-600">
            Sample users in system: {data.users.length}
            {#if data.users.length > 0}
              <br />
              (Notifications respect user preferences)
            {/if}
          </p>
        </div>

        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-2">Tips:</h3>
          <ul class="text-sm text-gray-600 space-y-1">
            <li>• Use "Test" button to preview notifications</li>
            <li>• Action URLs are optional but enhance engagement</li>
            <li>• Users can disable notification types in their preferences</li>
            <li>• Notifications appear under the bell icon only (no toast popups)</li>
            <li>• Users must click the bell to see their notifications</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>