import { expect } from '@playwright/test';
import { authenticatedTest, unauthenticatedTest } from './auth-fixtures';
import { createPlaylistHelpers } from './playlist/playlist-helpers';
import { VideoHelpers } from './helpers/video-helpers';

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

authenticatedTest.describe('Playlist Operations', () => {
  let playlistHelpers: ReturnType<typeof createPlaylistHelpers>;
  let videoHelpers: VideoHelpers;

  authenticatedTest.beforeEach(async ({ authenticatedPage }) => {
    playlistHelpers = createPlaylistHelpers(authenticatedPage);
    videoHelpers = new VideoHelpers(authenticatedPage);
    await playlistHelpers.navigateToHomepage();
  });

  authenticatedTest.describe('Basic Playlist Operations', () => {
    authenticatedTest('should create a new playlist', async ({ authenticatedPage }) => {
      const initialPlaylistCount = await playlistHelpers.getPlaylistButtons().count();
      
      const playlistName = await playlistHelpers.createPlaylist();
      
      // Verify playlist was created
      expect(playlistName).toBeTruthy();
      const newPlaylistCount = await playlistHelpers.getPlaylistButtons().count();
      expect(newPlaylistCount).toBe(initialPlaylistCount + 1);
      
      // Cleanup
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should delete a playlist', async ({ authenticatedPage }) => {
      // Create a playlist first
      await playlistHelpers.createPlaylist();
      const initialCount = await playlistHelpers.getPlaylistButtons().count();
      
      // Delete the playlist
      await playlistHelpers.deletePlaylist();
      
      // Verify playlist was deleted
      const finalCount = await playlistHelpers.getPlaylistButtons().count();
      expect(finalCount).toBe(initialCount - 1);
    });

    authenticatedTest('should add video to playlist via context menu', async ({ authenticatedPage }) => {
      // Create a playlist first
      const playlistName = await playlistHelpers.createPlaylist();
      
      // Get a video card and add it to the playlist
      const videoCard = await videoHelpers.getFirstVideoCard();
      await playlistHelpers.addVideoToPlaylist(videoCard, playlistName);
      
      // Navigate to playlist to verify video was added
      await playlistHelpers.navigateToPlaylist(playlistName);
      const playlistVideos = await playlistHelpers.getPlaylistVideos();
      expect(playlistVideos.length).toBeGreaterThan(0);
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should remove video from playlist', async ({ authenticatedPage }) => {
      // Create a playlist and add a video
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCard = await videoHelpers.getFirstVideoCard();
      await playlistHelpers.addVideoToPlaylist(videoCard, playlistName);
      
      // Navigate to playlist
      await playlistHelpers.navigateToPlaylist(playlistName);
      const initialVideos = await playlistHelpers.getPlaylistVideos();
      
      if (initialVideos.length > 0) {
        // Remove the first video
        await playlistHelpers.removeVideoFromPlaylist(initialVideos[0]);
        
        // Verify video was removed
        const remainingVideos = await playlistHelpers.getPlaylistVideos();
        expect(remainingVideos.length).toBe(initialVideos.length - 1);
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });
  });

  authenticatedTest.describe('Drag and Drop Operations', () => {
    authenticatedTest('should drag video from homepage onto playlist', async ({ authenticatedPage }) => {
      // Create a playlist
      const playlistName = await playlistHelpers.createPlaylist();
      const playlistButton = playlistHelpers.getPlaylistButton(0);
      
      // Get a video card and drag it to the playlist
      const videoCard = await videoHelpers.getFirstVideoCard();
      await playlistHelpers.dragVideoToPlaylist(videoCard, playlistButton);
      
      // Navigate to playlist to verify video was added
      await playlistHelpers.navigateToPlaylist(playlistName);
      const playlistVideos = await playlistHelpers.getPlaylistVideos();
      expect(playlistVideos.length).toBeGreaterThan(0);
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should reorder videos within playlist when sort is Custom', async ({ authenticatedPage }) => {
      // Create a playlist and add multiple videos
      const playlistName = await playlistHelpers.createPlaylist();
      
      // Add multiple videos to playlist
      const videoCards = await videoHelpers.getVideoCards();
      if (videoCards.length >= 2) {
        for (let i = 0; i < Math.min(3, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
      }
      
      // Navigate to playlist
      await playlistHelpers.navigateToPlaylist(playlistName);
      
      // Ensure sort order is Custom
      await playlistHelpers.changePlaylistSortOrder('Custom');
      
      const initialVideos = await playlistHelpers.getPlaylistVideos();
      if (initialVideos.length >= 2) {
        // Get initial order
        const firstVideoTitle = await videoHelpers.getVideoTitle(initialVideos[0]);
        const secondVideoTitle = await videoHelpers.getVideoTitle(initialVideos[1]);
        
        // Reorder videos
        await playlistHelpers.reorderVideosInPlaylist(0, 1);
        
        // Verify order changed
        const reorderedVideos = await playlistHelpers.getPlaylistVideos();
        const newFirstTitle = await videoHelpers.getVideoTitle(reorderedVideos[0]);
        const newSecondTitle = await videoHelpers.getVideoTitle(reorderedVideos[1]);
        
        expect(newFirstTitle).toBe(secondVideoTitle);
        expect(newSecondTitle).toBe(firstVideoTitle);
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should reorder playlists in sidebar', async ({ authenticatedPage }) => {
      // Create multiple playlists
      const playlist1Name = await playlistHelpers.createPlaylist();
      const playlist2Name = await playlistHelpers.createPlaylist();
      
      // Get initial order
      const initialButtons = playlistHelpers.getPlaylistButtons();
      const initialCount = await initialButtons.count();
      
      if (initialCount >= 2) {
        const firstPlaylistName = await initialButtons.nth(0).textContent();
        const secondPlaylistName = await initialButtons.nth(1).textContent();
        
        // Reorder playlists
        await playlistHelpers.dragPlaylistToPosition(0, 1);
        
        // Verify order changed
        const reorderedButtons = playlistHelpers.getPlaylistButtons();
        const newFirstName = await reorderedButtons.nth(0).textContent();
        const newSecondName = await reorderedButtons.nth(1).textContent();
        
        expect(newFirstName).toBe(secondPlaylistName);
        expect(newSecondName).toBe(firstPlaylistName);
      }
      
      // Cleanup
      await playlistHelpers.deletePlaylist();
      await playlistHelpers.deletePlaylist();
    });
  });

  authenticatedTest.describe('Playlist Sort Order', () => {
    authenticatedTest('should change sort order from Custom to Published At', async ({ authenticatedPage }) => {
      // Create a playlist and add videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 2) {
        for (let i = 0; i < Math.min(2, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
      }
      
      // Navigate to playlist
      await playlistHelpers.navigateToPlaylist(playlistName);
      
      // Change sort order
      await playlistHelpers.changePlaylistSortOrder('Published At', 'descending');
      
      // Verify sort order changed
      const currentSort = await playlistHelpers.getCurrentSortOrder();
      expect(currentSort.key).toBe('datePublished');
      expect(currentSort.order).toBe('descending');
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should change sort order to Title with ascending order', async ({ authenticatedPage }) => {
      // Create a playlist and add videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 2) {
        for (let i = 0; i < Math.min(2, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
      }
      
      // Navigate to playlist
      await playlistHelpers.navigateToPlaylist(playlistName);
      
      // Change sort order
      await playlistHelpers.changePlaylistSortOrder('Title', 'ascending');
      
      // Verify sort order changed
      const currentSort = await playlistHelpers.getCurrentSortOrder();
      expect(currentSort.key).toBe('title');
      expect(currentSort.order).toBe('ascending');
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should disable drag and drop when sort order is not Custom', async ({ authenticatedPage }) => {
      // Create a playlist and add videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 2) {
        for (let i = 0; i < Math.min(2, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
      }
      
      // Navigate to playlist
      await playlistHelpers.navigateToPlaylist(playlistName);
      
      // Change sort order to non-Custom
      await playlistHelpers.changePlaylistSortOrder('Published At', 'descending');
      
      // Verify drag and drop is disabled
      await playlistHelpers.verifyDragDisabled();
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should persist sort order when navigating back to playlist', async ({ authenticatedPage }) => {
      // Create a playlist and add videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 1) {
        await playlistHelpers.addVideoToPlaylist(videoCards[0], playlistName);
      }
      
      // Navigate to playlist
      await playlistHelpers.navigateToPlaylist(playlistName);
      
      // Change sort order
      await playlistHelpers.changePlaylistSortOrder('Title', 'descending');
      
      // Navigate away and back
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.navigateToPlaylist(playlistName);
      
      // Verify sort order persisted
      const currentSort = await playlistHelpers.getCurrentSortOrder();
      expect(currentSort.key).toBe('title');
      expect(currentSort.order).toBe('descending');
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });
  });
});

unauthenticatedTest.describe('Playlist Operations - Unauthenticated User', () => {
  let playlistHelpers: ReturnType<typeof createPlaylistHelpers>;
  let videoHelpers: VideoHelpers;

  unauthenticatedTest.beforeEach(async ({ page }) => {
    playlistHelpers = createPlaylistHelpers(page);
    videoHelpers = new VideoHelpers(page);
    await playlistHelpers.navigateToHomepage();
  });

  unauthenticatedTest('should not show create playlist button for unauthenticated users', async ({ page }) => {
    const createButton = page.getByTestId('create-playlist-button');
    await expect(createButton).not.toBeVisible();
  });

  unauthenticatedTest('should not allow playlist creation for unauthenticated users', async ({ page }) => {
    // Verify no playlists section is visible
    const playlistButtons = playlistHelpers.getPlaylistButtons();
    await expect(playlistButtons).toHaveCount(0);
  });

  unauthenticatedTest('should not show playlist context menus for unauthenticated users', async ({ page }) => {
    const videoCard = await videoHelpers.getFirstVideoCard();
    
    // Right-click should not show playlist-related options
    await videoCard.click({ button: 'right' });
    
    const addToPlaylistOption = page.getByText('Add to Playlist');
    await expect(addToPlaylistOption).not.toBeVisible();
  });
});