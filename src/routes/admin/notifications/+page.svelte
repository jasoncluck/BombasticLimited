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
    { value: 'mention', label: 'Mention' },
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
      message:
        'Thanks for being part of our community! Explore playlists and discover great content.',
      actionUrl: '/account/notifications',
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

<div class="container mx-auto max-w-4xl px-4 py-8">
  <div class="mb-8">
    <h1 class="mb-2 text-3xl font-bold">Notification Management</h1>
    <p class="text-gray-600">
      Send notifications to all users or test notifications
    </p>
  </div>

  <!-- Result Messages -->
  {#if form?.success}
    <div
      class="mb-6 rounded border border-green-400 bg-green-100 p-4 text-green-700"
    >
      {#if form.count !== undefined}
        ✅ Global notification sent successfully to {form.count} users!
      {:else}
        ✅ Test notification sent successfully!
      {/if}
    </div>
  {:else if form?.error}
    <div class="mb-6 rounded border border-red-400 bg-red-100 p-4 text-red-700">
      ❌ Error: {form.error}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
    <!-- Notification Form -->
    <div class="rounded-lg bg-white p-6 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold">Create Notification</h2>

      <!-- Template Buttons -->
      <div class="mb-6">
        <h3 class="mb-2 text-sm font-medium text-gray-700">Quick Templates:</h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200"
            onclick={() => loadTemplate('welcome')}
          >
            Welcome
          </button>
          <button
            type="button"
            class="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200"
            onclick={() => loadTemplate('feature')}
          >
            New Feature
          </button>
          <button
            type="button"
            class="rounded bg-yellow-100 px-3 py-1 text-sm text-yellow-700 hover:bg-yellow-200"
            onclick={() => loadTemplate('maintenance')}
          >
            Maintenance
          </button>
          <button
            type="button"
            class="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
            onclick={resetForm}
          >
            Clear
          </button>
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
        <div class="space-y-4">
          <!-- Type Selection -->
          <div>
            <label
              for="type"
              class="mb-1 block text-sm font-medium text-gray-700"
            >
              Type
            </label>
            <select
              id="type"
              name="type"
              bind:value={selectedType}
              class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {#each notificationTypes as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </select>
          </div>

          <!-- Title -->
          <div>
            <label
              for="title"
              class="mb-1 block text-sm font-medium text-gray-700"
            >
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              bind:value={title}
              required
              class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter notification title"
            />
          </div>

          <!-- Message -->
          <div>
            <label
              for="message"
              class="mb-1 block text-sm font-medium text-gray-700"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              bind:value={message}
              required
              rows="3"
              class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter notification message"
            ></textarea>
          </div>

          <!-- Action URL (Optional) -->
          <div>
            <label
              for="actionUrl"
              class="mb-1 block text-sm font-medium text-gray-700"
            >
              Action URL (Optional)
            </label>
            <input
              id="actionUrl"
              name="actionUrl"
              type="url"
              bind:value={actionUrl}
              class="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="https://example.com/link"
            />
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-4">
            <button
              type="submit"
              formaction="?/sendGlobalNotification"
              disabled={isSubmitting || !title || !message}
              class="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              class="flex-1 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div class="rounded-lg bg-white p-6 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold">Information</h2>

      <div class="space-y-4">
        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700">
            Notification Types:
          </h3>
          <ul class="space-y-1 text-sm text-gray-600">
            <li>
              <strong>System:</strong> Platform announcements, maintenance
            </li>
            <li><strong>Content:</strong> New videos, updates</li>
            <li><strong>User:</strong> User interactions, follows</li>
            <li><strong>Playlist Update:</strong> Playlist changes</li>
            <li><strong>Mention:</strong> User mentions</li>
          </ul>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700">User Stats:</h3>
          <p class="text-sm text-gray-600">
            Sample users in system: {data.users.length}
            {#if data.users.length > 0}
              <br />
              (Notifications respect user preferences)
            {/if}
          </p>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700">Tips:</h3>
          <ul class="space-y-1 text-sm text-gray-600">
            <li>• Use "Test" button to preview notifications</li>
            <li>• Action URLs are optional but enhance engagement</li>
            <li>• Users can disable notification types in their preferences</li>
            <li>
              • Notifications appear under the bell icon only (no toast popups)
            </li>
            <li>• Users must click the bell to see their notifications</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>
