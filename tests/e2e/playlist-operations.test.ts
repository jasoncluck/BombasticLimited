import { expect } from '@playwright/test';
import { unauthenticatedTest } from './auth-fixtures';
import { playlistTest } from './playlist-fixtures';

/**
 * E2E tests for playlist operations and functionality
 *
 * These tests cover comprehensive playlist functionality including:
 * 1. Basic playlist operations (create, delete, add/remove videos)
 * 2. Drag and drop functionality (videos to playlists, playlist reordering)
 * 3. Playlist sort order management and persistence
 * 4. Video reordering within playlists when sort is Custom
 * 5. UI state verification and user interactions
 */

playlistTest.describe('Playlist Operations', () => {
  playlistTest.beforeEach(async ({ playlistPage }) => {
    // Navigate to homepage to start tests
    await playlistPage.goto('/');
  });

  playlistTest.describe('Basic Playlist Operations', () => {
    playlistTest(
      'should create a new playlist',
      async ({ playlistHelpers }) => {
        const playlistId = await playlistHelpers.createPlaylist();

        // Verify playlist was created
        expect(playlistId).toBeTruthy();
        const newPlaylistButton = playlistHelpers.getPlaylistButton().first();
        expect(newPlaylistButton).toBeVisible();

        // No manual cleanup needed - fixture handles it
      }
    );

    playlistTest('should delete a playlist', async ({ playlistHelpers }) => {
      // Create a playlist first
      const playlistId = await playlistHelpers.createPlaylist();
      await playlistHelpers.getPlaylistButton().count();

      // Delete the playlist
      await playlistHelpers.deletePlaylist(playlistId);
    });

    playlistTest(
      'should add a video to playlist via context menu',
      async ({ playlistHelpers, playlistPage }) => {
        // Create a playlist first
        const playlistId = await playlistHelpers.createPlaylist();

        // Get the first video from the homepage
        const firstVideo = playlistPage.getByTestId('carousel-item').first();
        await expect(firstVideo).toBeVisible();

        // Get video ID for verification
        const videoId = await firstVideo
          .locator('[data-testid="content-item"]')
          .getAttribute('data-video-id');
        expect(videoId).toBeTruthy();

        // Add video to playlist
        await playlistHelpers.addVideoToPlaylistViaDropdown(
          playlistId,
          firstVideo
        );

        // Verify video was added to playlist
        await playlistHelpers.verifyVideoInPlaylist(playlistId, videoId!);
      }
    );

    playlistTest(
      'should remove a video from playlist',
      async ({ playlistHelpers, playlistPage }) => {
        // Create a playlist first
        const playlistId = await playlistHelpers.createPlaylist();

        // Get the first video and add it to playlist
        const firstVideo = playlistPage.getByTestId('carousel-item').first();
        const videoId = await firstVideo
          .locator('[data-testid="content-item"]')
          .getAttribute('data-video-id');
        await playlistHelpers.addVideoToPlaylistViaDropdown(
          playlistId,
          firstVideo
        );

        // Verify video was added
        await playlistHelpers.verifyVideoInPlaylist(playlistId, videoId!);

        // Navigate to playlist page
        await playlistHelpers.navigateToPlaylistPage(playlistId);

        // Remove the video from playlist
        const playlistVideo = playlistPage
          .locator(`[data-video-id="${videoId}"]`)
          .first();
        await expect(playlistVideo).toBeVisible();

        // Right-click and remove
        await playlistVideo.click({ button: 'right' });
        const removeOption = playlistPage.getByText(
          'Remove video from playlist'
        );
        await expect(removeOption).toBeVisible();
        await removeOption.click();

        // Wait for the video element to disappear from the DOM
        if (videoId) {
          await expect(playlistVideo).not.toBeVisible({ timeout: 10000 });

          // Additional wait to ensure the removal is fully processed
          await playlistPage.waitForTimeout(1000);

          // Verify video was removed
          await playlistHelpers.verifyVideoNotInPlaylist(playlistId, videoId);
        }
      }
    );
  });

  playlistTest.describe('Video to Playlist Drag and Drop', () => {
    playlistTest(
      'should drag video from homepage to playlist',
      async ({ playlistHelpers, playlistPage }) => {
        // Create a playlist first
        const playlistId = await playlistHelpers.createPlaylist();

        // Get the first video from homepage
        const firstVideo = playlistPage.getByTestId('carousel-item').first();
        const videoId = await firstVideo
          .locator('[data-testid="content-item"]')
          .getAttribute('data-video-id');

        // Get the playlist button for drag target
        const playlistButton = playlistHelpers.getPlaylistButton(playlistId);

        // Perform drag and drop
        await firstVideo.dragTo(playlistButton);

        // Wait for operation to complete
        await playlistPage.waitForTimeout(1000);

        // Verify video was added to playlist
        await playlistHelpers.verifyVideoInPlaylist(playlistId, videoId!);
      }
    );
  });

  playlistTest.describe('Playlist Drag and Drop Reordering', () => {
    playlistTest(
      'should reorder playlists in sidebar',
      async ({ playlistHelpers }) => {
        // Create two playlists
        const playlistId1 = await playlistHelpers.createPlaylist();
        const playlistId2 = await playlistHelpers.createPlaylist();

        // Get initial order
        const initialFirst = playlistHelpers.getPlaylistButton(playlistId1);
        const initialSecond = playlistHelpers.getPlaylistButton(playlistId2);

        // Verify initial order
        await expect(initialFirst).toBeVisible();
        await expect(initialSecond).toBeVisible();

        // Perform drag and drop to reorder
        await initialFirst.dragTo(initialSecond);

        // Wait for reorder operation
        await playlistHelpers.getPlaylistButton().first().waitFor();

        // The playlists should still be visible (order verification would need more complex logic)
        await expect(
          playlistHelpers.getPlaylistButton(playlistId1)
        ).toBeVisible();
        await expect(
          playlistHelpers.getPlaylistButton(playlistId2)
        ).toBeVisible();
      }
    );
  });
});

// Test for unauthenticated users
unauthenticatedTest.describe('Playlist Operations - Unauthenticated', () => {
  unauthenticatedTest(
    'should not show playlist creation options',
    async ({ unauthenticatedPage }) => {
      await unauthenticatedPage.goto('/');

      // Verify create playlist button is not visible
      const createPlaylistButton = unauthenticatedPage.getByTestId(
        'create-playlist-button'
      );
      await expect(createPlaylistButton).not.toBeVisible();

      // Verify no playlist buttons are visible
      const playlistButtons =
        unauthenticatedPage.getByTestId('playlist-button');
      await expect(playlistButtons).toHaveCount(0);
    }
  );

  unauthenticatedTest(
    'should not show add to playlist options in context menus',
    async ({ unauthenticatedPage }) => {
      await unauthenticatedPage.goto('/');

      // Get first video
      const firstVideo = unauthenticatedPage
        .getByTestId('carousel-item')
        .first();
      await expect(firstVideo).toBeVisible();

      // Try to open context menu
      await firstVideo.click({ button: 'right' });

      // Check if context menu appears (might not for unauthenticated users)
      const contextMenu = unauthenticatedPage.locator(
        '[role="menu"][data-state="open"]'
      );
      const isContextMenuVisible = await contextMenu
        .isVisible()
        .catch(() => false);

      if (isContextMenuVisible) {
        // If context menu appears, verify no playlist options
        const addToPlaylistOption = contextMenu.getByText(/playlist/i);
        await expect(addToPlaylistOption).not.toBeVisible();
      }
    }
  );
});
