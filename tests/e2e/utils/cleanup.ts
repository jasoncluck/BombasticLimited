import { type Page } from '@playwright/test';

/**
 * Global cleanup system for E2E tests
 * This ensures playlists are properly cleaned up even if tests fail
 */

// Global registry of cleanup functions
const cleanupFunctions: Array<() => Promise<void>> = [];

export function registerCleanupFunction(cleanupFn: () => Promise<void>) {
  cleanupFunctions.push(cleanupFn);
}

export async function runGlobalCleanup() {
  console.log(
    `Running cleanup for ${cleanupFunctions.length} registered functions...`
  );

  for (const cleanupFn of cleanupFunctions) {
    try {
      await cleanupFn();
    } catch (error) {
      console.warn('Cleanup function failed:', error);
    }
  }

  // Clear the registry
  cleanupFunctions.length = 0;
}

export async function cleanupAllPlaylists(page: Page) {
  try {
    // Navigate to homepage to see playlists
    await page.goto('/', { timeout: 5000 });

    // Find all playlist buttons
    const playlistButtons = page.getByTestId('playlist-button');
    const count = await playlistButtons.count();

    console.log(`Found ${count} playlists to clean up`);

    // Delete all playlists
    for (let i = count - 1; i >= 0; i--) {
      try {
        const playlistButton = playlistButtons.nth(i);

        if (await playlistButton.isVisible({ timeout: 1000 })) {
          // Right-click to open context menu
          await playlistButton.click({ button: 'right' });

          const playlistContextMenu = page.getByTestId(
            'playlist-context-content'
          );
          if (await playlistContextMenu.isVisible({ timeout: 2000 })) {
            const deleteContextItem = page.getByTestId('playlist-context-item');
            await deleteContextItem.click();

            // Confirm deletion if there's a confirmation dialog
            const confirmDeleteButton = page.getByTestId(
              'confirm-delete-playlist'
            );
            if (await confirmDeleteButton.isVisible({ timeout: 1000 })) {
              await confirmDeleteButton.click();
            }

            // Wait for deletion to complete
            await page.waitForTimeout(500);
          }
        }
      } catch (error) {
        console.warn(`Failed to delete playlist ${i}:`, error);
      }
    }

    console.log('Playlist cleanup completed');
  } catch (error) {
    console.warn('Global playlist cleanup failed:', error);
  }
}
