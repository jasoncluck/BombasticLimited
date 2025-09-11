import { expect, type Page, type Locator } from '@playwright/test';
import { authenticatedTest } from './auth-fixtures';

function createPlaylistHelpers(page: Page, createdPlaylistIds: string[]) {
  return {
    async createPlaylist(name?: string): Promise<string> {
      const createPlaylistButton = page.getByTestId('create-playlist-button');
      await createPlaylistButton.waitFor();
      await createPlaylistButton.click();

      // If a name is provided, set it
      // if (name) {
      //   const nameInput = page.getByTestId('playlist-name-input');
      //   await nameInput.fill(name);
      //   const confirmButton = page.getByTestId('confirm-playlist-creation');
      //   await confirmButton.click();
      // }

      // Wait for the new playlist to appear
      const newPlaylistButton = page.getByTestId('playlist-button').last();
      await expect(newPlaylistButton).toBeVisible();

      // Get the playlist ID from the element or generate one
      const playlistId =
        await newPlaylistButton.getAttribute('data-playlist-id');

      // Track created playlist for cleanup
      if (!playlistId) {
        throw new Error('Could not create new playlist ');
      }
      createdPlaylistIds.push(playlistId);

      return playlistId;
    },

    async deletePlaylist(playlistId: string): Promise<void> {
      const playlistButton = this.getPlaylistButton(playlistId);

      // Right-click to open context menu
      await playlistButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await expect(playlistContextMenu).toBeVisible();

      const deleteContextItem = page.getByTestId('playlist-context-item');
      await deleteContextItem.click();

      // Confirm deletion if there's a confirmation dialog
      const confirmDeleteButton = page.getByTestId('confirm-delete-playlist');
      if (
        await confirmDeleteButton
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await confirmDeleteButton.click();
      }

      // Wait for the playlist to be removed
      await expect(playlistButton).toHaveCount(0);

      // Remove from tracking
      const index = createdPlaylistIds.indexOf(playlistId);
      if (index > -1) {
        createdPlaylistIds.splice(index, 1);
      }
    },

    getPlaylistButton(playlistId?: string) {
      if (playlistId) {
        // Use the correct locator syntax for finding elements with specific data attributes
        return page.locator(
          `[data-testid="playlist-button"][data-playlist-id="${playlistId}"]`
        );
      }
      return page.getByTestId('playlist-button');
    },

    async openPlaylistContextMenu(playlistId?: string): Promise<void> {
      const playlistButton = this.getPlaylistButton(playlistId);
      await playlistButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await expect(playlistContextMenu).toBeVisible();
    },

    async navigateToPlaylistPage(playlistId: string): Promise<void> {
      const playlistButton = this.getPlaylistButton(playlistId);
      await playlistButton.waitFor({ state: 'visible' });

      // Add timeout to let sidebar state update
      await page.waitForTimeout(4000);
      await playlistButton.click();

      // Wait for the playlist page to load with proper URL pattern matching
      const playlistUrlPattern = new RegExp(
        `.*/playlist/${playlistId}(?:/.*)?$`
      );
      await expect(page).toHaveURL(playlistUrlPattern, { timeout: 10000 });

      // Wait for the playlist content to be visible
      const playlistContent = page.getByTestId('playlist-content');
      await expect(playlistContent).toBeVisible({ timeout: 10000 });
    },

    async checkVideoInPlaylist(
      playlistId: string,
      videoId: string
    ): Promise<boolean> {
      // Store current URL to return to it later
      const originalUrl = page.url();

      try {
        // Navigate to the playlist page and wait for proper URL
        await this.navigateToPlaylistPage(playlistId);

        // Double-check we're on the correct playlist page
        const playlistUrlPattern = new RegExp(
          `.*/playlist/${playlistId}(?:/.*)?$`
        );
        await expect(page).toHaveURL(playlistUrlPattern, { timeout: 5000 });

        // Wait for the playlist content to fully load
        const playlistContent = page.getByTestId('playlist-content');
        await expect(playlistContent).toBeVisible({ timeout: 10000 });

        // Search for the video element with the specific data-video-id
        const videoElement = page.locator(`[data-video-id="${videoId}"]`);

        try {
          // Check if the video element exists and is visible
          await expect(videoElement).toBeVisible({ timeout: 10000 });
          return true;
        } catch {
          // Video not found in playlist
          return false;
        }
      } catch {
        console.warn(
          `Error checking video ${videoId} in playlist ${playlistId}`
        );
        return false;
      } finally {
        // Navigate back to original page if we're not already there
        if (originalUrl !== page.url()) {
          try {
            await page.goto(originalUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 10000,
            });
          } catch (navigationError) {
            console.warn(
              `Failed to navigate back to original URL ${originalUrl}:`,
              navigationError
            );
          }
        }
      }
    },

    async verifyVideoInPlaylist(
      playlistId: string,
      videoId: string
    ): Promise<void> {
      const videoExists = await this.checkVideoInPlaylist(playlistId, videoId);

      if (!videoExists) {
        // Get current URL for debugging
        const currentUrl = page.url();
        throw new Error(
          `Video with ID "${videoId}" was not found in playlist "${playlistId}". Current URL: ${currentUrl}`
        );
      }
    },

    async verifyVideoNotInPlaylist(
      playlistId: string,
      videoId: string
    ): Promise<void> {
      const videoExists = await this.checkVideoInPlaylist(playlistId, videoId);

      if (videoExists) {
        // Get current URL for debugging
        const currentUrl = page.url();
        throw new Error(
          `Video with ID "${videoId}" was unexpectedly found in playlist "${playlistId}". Current URL: ${currentUrl}`
        );
      }
    },

    extractVideoIdFromUrl(url: string): string {
      const videoIdMatch = url.match(/\/video\/([a-zA-Z0-9_-]+)$/);

      if (!videoIdMatch) {
        throw new Error(`Could not extract video ID from URL: ${url}`);
      }

      return videoIdMatch[1];
    },

    async extractVideoIdFromCurrentUrl(): Promise<string> {
      // Wait for the URL to contain /video/ pattern first
      await expect(page).toHaveURL(/\/video\/[a-zA-Z0-9_-]+$/, {
        timeout: 10000,
      });

      // Now get the current URL and extract the video ID
      const currentUrl = page.url();
      return this.extractVideoIdFromUrl(currentUrl);
    },

    async openAndSelectPlaylist(
      playlistId: string,
      videoElement?: Locator
    ): Promise<void> {
      try {
        // Click the content dropdown trigger - scoped to specific video if provided
        let contentDropdownTrigger;
        let targetVideoElement;

        // Only hover for content cards, not for video pages where dropdown is always visible
        const currentUrl = page.url();
        const isVideoPage = /\/video\/[^/]+(?:\/.*)?$/.test(currentUrl);

        if (videoElement) {
          contentDropdownTrigger = videoElement.getByTestId(
            'content-dropdown-trigger'
          );
          targetVideoElement = videoElement;
        } else if (isVideoPage) {
          contentDropdownTrigger = page.getByTestId('content-dropdown-trigger');
        } else {
          const firstVideoElement = page.getByTestId('carousel-item').first();
          contentDropdownTrigger = firstVideoElement.getByTestId(
            'content-dropdown-trigger'
          );
          targetVideoElement = firstVideoElement;
        }

        if (!isVideoPage && targetVideoElement) {
          // Hover over the video element to make the dropdown trigger visible
          await targetVideoElement.hover();
        }

        // Wait for the dropdown trigger to become visible and clickable
        await expect(contentDropdownTrigger).toBeVisible();
        await contentDropdownTrigger.click();

        // Wait for the main dropdown content to appear
        const contentDropdownContent = page.getByTestId(
          'content-dropdown-content'
        );
        await expect(contentDropdownContent).toBeVisible();

        // Click the "Add video to playlist" or "Add videos to playlist" option
        // This will trigger the submenu to open
        const addToPlaylistOption =
          contentDropdownContent.getByText(/Add .* to playlist/);
        await expect(addToPlaylistOption).toBeVisible();
        await addToPlaylistOption.click();

        // Wait for the playlist submenu content to appear (using the correct test ID)
        const playlistSubContent = page.getByTestId('add-playlist-content');
        await expect(playlistSubContent).toBeVisible({ timeout: 5000 });

        // Try multiple ways to find the playlist item
        let playlistItem = playlistSubContent.locator(
          `[data-playlist-id="${playlistId}"]`
        );

        // If data-playlist-id doesn't work, try finding by the playlist name
        if (!(await playlistItem.count())) {
          // First, let's get the playlist name from the sidebar
          const sidebarPlaylistButton = this.getPlaylistButton(playlistId);
          let playlistName = '';

          if (await sidebarPlaylistButton.count()) {
            playlistName = (await sidebarPlaylistButton.textContent()) || '';
          }

          if (playlistName) {
            // Try to find by text content
            playlistItem = playlistSubContent.getByText(playlistName, {
              exact: true,
            });
          }
        }

        // If still not found, try a more generic approach
        if (!(await playlistItem.count())) {
          // Get all items in the submenu and find the one with matching playlist ID
          const allItems = playlistSubContent.locator('[role="menuitem"]');
          const itemCount = await allItems.count();

          for (let i = 0; i < itemCount; i++) {
            const item = allItems.nth(i);
            const itemPlaylistId = await item.getAttribute('data-playlist-id');

            if (itemPlaylistId === playlistId) {
              playlistItem = item;
              break;
            }
          }
        }

        // Final fallback: try to find by any attribute that might contain the playlist ID
        if (!(await playlistItem.count())) {
          playlistItem = playlistSubContent.locator(`*[*="${playlistId}"]`);
        }

        // Log debug information if still not found
        if (!(await playlistItem.count())) {
          console.log('Debug: Playlist submenu HTML structure:');
          const submenuHtml = await playlistSubContent.innerHTML();
          console.log(submenuHtml);

          console.log('Debug: All items in submenu:');
          const allItems = playlistSubContent.locator('*');
          const itemCount = await allItems.count();
          for (let i = 0; i < itemCount; i++) {
            const item = allItems.nth(i);
            const outerHTML = await item.evaluate((el) => el.outerHTML);
            console.log(`Item ${i}:`, outerHTML);
          }
        }

        await expect(playlistItem).toBeVisible({ timeout: 5000 });
        await playlistItem.click();

        // Wait for success feedback
        await this.waitForSuccessFeedback();
      } catch (error) {
        // Enhanced error reporting
        const submenuVisible = await page
          .getByTestId('add-playlist-content')
          .isVisible()
          .catch(() => false);
        const dropdownVisible = await page
          .getByTestId('content-dropdown-content')
          .isVisible()
          .catch(() => false);

        throw new Error(
          `Failed to open and select playlist "${playlistId}": ${error instanceof Error ? error.message : String(error)}\n` +
            `Debug info: Dropdown visible: ${dropdownVisible}, Submenu visible: ${submenuVisible}`
        );
      }
    },

    async waitForSuccessFeedback(timeout: number = 5000): Promise<void> {
      try {
        // Wait for success toast/notification
        const successToast = page.locator('.toast-success');
        if (
          await successToast.isVisible({ timeout: 1000 }).catch(() => false)
        ) {
          await expect(successToast).toBeVisible();
          return;
        }

        // Alternative: Wait for success message
        const successMessage = page.getByTestId('video-added-success');
        if (
          await successMessage.isVisible({ timeout: 1000 }).catch(() => false)
        ) {
          await expect(successMessage).toBeVisible();
          return;
        }

        // Alternative: Check if dropdown closes (indicating success)
        const contentDropdownContent = page.getByTestId(
          'content-dropdown-content'
        );
        await expect(contentDropdownContent).toBeHidden({ timeout });
      } catch (error) {
        console.warn('No success feedback detected, proceeding with test');
        // Don't throw error, just log warning and continue
      }
    },

    async addVideoToPlaylistViaDropdown(
      playlistId: string,
      videoElement?: Locator
    ): Promise<void> {
      await this.openAndSelectPlaylist(playlistId, videoElement);
    },

    async verifyPlaylistExists(playlistId: string): Promise<void> {
      const playlistButton = this.getPlaylistButton(playlistId);
      await expect(playlistButton).toHaveCount(1);
    },

    async verifyPlaylistDoesNotExist(playlistId: string): Promise<void> {
      const playlistButton = this.getPlaylistButton(playlistId);
      await expect(playlistButton).toHaveCount(0);
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

// Playlist test that extends authenticated test
export const playlistTest = authenticatedTest.extend<{
  playlistPage: Page;
  playlistHelpers: ReturnType<typeof createPlaylistHelpers>;
  createdPlaylistIds: string[];
}>({
  createdPlaylistIds: async ({}, use) => {
    const playlistIds: string[] = [];
    await use(playlistIds);
    // Cleanup is handled in the playlistHelpers fixture
  },

  playlistHelpers: async ({ authenticatedPage, createdPlaylistIds }, use) => {
    const helpers = createPlaylistHelpers(
      authenticatedPage,
      createdPlaylistIds
    );
    await use(helpers);

    // Cleanup after test
    await helpers.cleanup();
  },

  playlistPage: async ({ authenticatedPage }, use) => {
    // Navigate to a page where playlists can be managed
    await authenticatedPage.goto('/');
    await use(authenticatedPage);
  },
});

// Convenience function for tests that need a playlist already created
export const playlistWithDataTest = playlistTest.extend<{
  existingPlaylistId: string;
}>({
  existingPlaylistId: async ({ playlistHelpers }, use) => {
    // Create a playlist before the test runs
    const playlistId = await playlistHelpers.createPlaylist('Test Playlist');
    await use(playlistId);
    // Cleanup is handled by playlistHelpers fixture
  },
});

export { expect };
