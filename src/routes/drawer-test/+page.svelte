<script lang="ts">
  import { getDrawerState } from "$lib/state/drawer.svelte";

  const drawerState = getDrawerState();

  // Simple test component as a string template
  const TestDrawerContent = `
    <div class="p-4">
      <h2 class="text-lg font-semibold mb-2">Test Drawer Content</h2>
      <p>This is a test drawer to verify animations work!</p>
      <p class="mt-2 text-sm text-gray-600">Click the close button or press ESC to close.</p>
    </div>
  `;

  function openTestDrawer() {
    drawerState.open({
      component: (() => TestDrawerContent) as any,
      props: {},
      title: "Test Drawer",
      subtitle: "Testing close button and ESC key functionality",
      options: {
        showCloseButton: true,
        closeButtonText: "Close Test Drawer",
      },
    });
  }
</script>

<div class="p-8">
  <h1 class="text-2xl font-bold mb-4">Drawer Test Page</h1>
  
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold mb-2">Test Instructions:</h2>
      <ol class="list-decimal ml-6 space-y-2">
        <li>Click "Open Test Drawer" to open a drawer</li>
        <li>Verify the drawer slides in with animation</li>
        <li>Click the "Close Test Drawer" button to close it</li>
        <li>Verify the drawer slides out with animation</li>
        <li>Open the drawer again and press ESC to close it</li>
        <li>Verify the drawer slides out with animation</li>
      </ol>
    </div>

    <button 
      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" 
      onclick={openTestDrawer}
    >
      Open Test Drawer
    </button>

    <div class="mt-4">
      <p><strong>Current drawer state:</strong></p>
      <ul class="ml-4">
        <li>Is Open: {drawerState.isOpen}</li>
        <li>Has Content: {drawerState.hasContent}</li>
        <li>Title: {drawerState.currentTitle || "None"}</li>
      </ul>
    </div>
  </div>
</div>