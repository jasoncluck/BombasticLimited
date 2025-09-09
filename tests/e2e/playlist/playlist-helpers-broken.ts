import { type Page } from '@playwright/test';
import { registerCleanupFunction } from '../utils/cleanup';

/**
 * Backward compatibility wrapper for playlist helpers
 * This provides a simple interface that tracks created playlists for cleanup
 */

export interface PlaylistHelpers {
  createPlaylist(): Promise<string>;
  deletePlaylist(playlistId?: string): Promise<void>;
  getPlaylistButton(playlistId?: string): any;
  getPlaylistButtons(): any;
  navigateToHomepage(): Promise<void>;
  addVideoToPlaylistViaDropdown(playlistId: string): Promise<void>;
  navigateToPlaylistPage(playlistId: string): Promise<void>;
  verifyVideoInPlaylist(playlistId: string, videoId: string): Promise<void>;
  verifyVideoNotInPlaylist(playlistId: string, videoId: string): Promise<void>;
  cleanup(): Promise<void>;
}

export function createPlaylistHelpers(page: Page): PlaylistHelpers {
  // Track created playlists for this instance
  const createdPlaylistIds: string[] = [];
  
  // Register cleanup function globally
  const cleanupFn = async () => {
    for (const playlistId of [...createdPlaylistIds]) {
      try {
        await helpers.deletePlaylist(playlistId);
      } catch (error) {
        console.warn(`Failed to cleanup playlist ${playlistId}:`, error);
      }
    }
    createdPlaylistIds.length = 0;
  };
  
  registerCleanupFunction(cleanupFn);

  const helpers: PlaylistHelpers = {
    async createPlaylist(): Promise<string> {
    async createPlaylist(): Promise<string> {
      const createPlaylistButton = page.getByTestId('create-playlist-button');
      await createPlaylistButton.waitFor();
      await createPlaylistButton.click();

      // Wait for the new playlist to appear
      const newPlaylistButton = page.getByTestId('playlist-button').last();
      await newPlaylistButton.waitFor();

      // Get the playlist ID from the element
      const playlistId = await newPlaylistButton.getAttribute('data-playlist-id');

      if (!playlistId) {
        throw new Error('Could not create new playlist');
      }
      
      // Track for cleanup
      createdPlaylistIds.push(playlistId);

      return playlistId;
    },

    async deletePlaylist(playlistId?: string): Promise<void> {
      let targetButton;
      
      if (playlistId) {
        targetButton = page.locator(`[data-testid="playlist-button"][data-playlist-id="${playlistId}"]`);
      } else {
        targetButton = page.getByTestId('playlist-button').first();
        playlistId = await targetButton.getAttribute('data-playlist-id');
      }

      // Right-click to open context menu
      await targetButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await playlistContextMenu.waitFor();

      const deleteContextItem = page.getByTestId('playlist-context-item');
      await deleteContextItem.click();

      // Confirm deletion if there's a confirmation dialog
      const confirmDeleteButton = page.getByTestId('confirm-delete-playlist');
      if (await confirmDeleteButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmDeleteButton.click();
      }

      // Wait for the playlist to be removed
      await targetButton.waitFor({ state: 'detached' });

      // Remove from tracking
      if (playlistId) {
        const index = createdPlaylistIds.indexOf(playlistId);
        if (index > -1) {
          createdPlaylistIds.splice(index, 1);
        }
      }
    },

    getPlaylistButton(playlistId?: string) {
      if (playlistId) {
        return page.locator(`[data-testid="playlist-button"][data-playlist-id="${playlistId}"]`);
      }
      return page.getByTestId('playlist-button');
    },

    getPlaylistButtons() {
      return page.getByTestId('playlist-button');
    },

    async navigateToHomepage(): Promise<void> {
      await page.goto('/');
    },

    async addVideoToPlaylistViaDropdown(playlistId: string): Promise<void> {
      // Click the content dropdown trigger
      const contentDropdownTrigger = page.getByTestId('content-dropdown-trigger');
      await contentDropdownTrigger.waitFor();
      await contentDropdownTrigger.click();

      // Wait for the main dropdown content to appear
      const contentDropdownContent = page.getByTestId('content-dropdown-content');
      await contentDropdownContent.waitFor();

      // Click the "Add video to playlist" option
      const addToPlaylistOption = contentDropdownContent.getByText(/Add .* to playlist/);
      await addToPlaylistOption.waitFor();
      await addToPlaylistOption.click();

      // Wait for the playlist submenu content to appear
      const playlistSubContent = page.getByTestId('add-playlist-content');
      await playlistSubContent.waitFor();

      // Find the playlist item
      const playlistItem = playlistSubContent.locator(`[data-playlist-id="${playlistId}"]`);
      await playlistItem.waitFor();
      await playlistItem.click();

      // Wait for success feedback
      await this.waitForSuccessFeedback();
    },

    async waitForSuccessFeedback(timeout: number = 5000): Promise<void> {
      try {
        // Wait for success toast/notification
        const successToast = page.locator('.toast-success');
        if (await successToast.isVisible({ timeout: 1000 }).catch(() => false)) {
          return;
        }

        // Alternative: Wait for success message
        const successMessage = page.getByTestId('video-added-success');
        if (await successMessage.isVisible({ timeout: 1000 }).catch(() => false)) {
          return;
        }

        // Alternative: Check if dropdown closes (indicating success)
        const contentDropdownContent = page.getByTestId('content-dropdown-content');
        await contentDropdownContent.waitFor({ state: 'hidden', timeout });
      } catch (error) {
        console.warn('No success feedback detected, proceeding with test');
      }
    },

    async navigateToPlaylistPage(playlistId: string): Promise<void> {
      const playlistButton = this.getPlaylistButton(playlistId);
      await playlistButton.waitFor();
      await playlistButton.click();

      // Wait for the playlist page to load
      const playlistUrlPattern = new RegExp(`.*\/playlist\/${playlistId}(?:\/.*)?$`);
      await page.waitForURL(playlistUrlPattern, { timeout: 10000 });

      // Wait for the playlist content to be visible
      const playlistContent = page.getByTestId('playlist-content');
      await playlistContent.waitFor({ timeout: 10000 });
    },

    async verifyVideoInPlaylist(playlistId: string, videoId: string): Promise<void> {
      // Store current URL to return to it later
      const originalUrl = page.url();

      try {
        // Navigate to the playlist page and wait for proper URL
        await this.navigateToPlaylistPage(playlistId);

        // Wait for the playlist content to fully load
        const playlistContent = page.getByTestId('playlist-content');
        await playlistContent.waitFor({ timeout: 5000 });

        // Search for the video element with the specific data-video-id
        const videoElement = page.locator(`[data-video-id="${videoId}"]`);
        await videoElement.waitFor({ timeout: 5000 });
      } catch (error) {
        throw new Error(`Video with ID "${videoId}" was not found in playlist "${playlistId}"`);
      } finally {
        // Navigate back to original page if we're not already there
        if (originalUrl !== page.url()) {
          await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        }
      }
    },

    async verifyVideoNotInPlaylist(playlistId: string, videoId: string): Promise<void> {
      try {
        await this.verifyVideoInPlaylist(playlistId, videoId);
        throw new Error(`Video with ID "${videoId}" was unexpectedly found in playlist "${playlistId}"`);
      } catch (error) {
        // If verification throws an error, that means video is not in playlist (expected)
        if (error.message.includes('was not found')) {
          return; // This is expected
        }
        throw error; // Re-throw other errors
      }
    },

    async cleanup(): Promise<void> {
      // Clean up any remaining playlists
      for (const playlistId of [...createdPlaylistIds]) {
        try {
          await this.deletePlaylist(playlistId);
        } catch (error) {
          console.warn(`Failed to cleanup playlist ${playlistId}:`, error);
        }
      }
      createdPlaylistIds.length = 0; // Clear the array
    },
  };
}