import { type Page, expect, type Locator } from '@playwright/test';

export interface PlaylistHelpers {
  // Basic playlist operations
  createPlaylist(): Promise<string>;
  deletePlaylist(playlistSelector?: string): Promise<void>;
  getPlaylistButton(index?: number): Locator;
  getPlaylistButtons(): Locator;
  
  // Context menu operations
  openPlaylistContextMenu(playlistSelector?: string): Promise<void>;
  addCurrentVideoToPlaylist(): Promise<void>;
  
  // Navigation
  navigateToPlaylist(playlistName: string): Promise<void>;
  navigateToHomepage(): Promise<void>;
  
  // Video operations
  addVideoToPlaylist(videoCard: Locator, playlistName: string): Promise<void>;
  removeVideoFromPlaylist(videoCard: Locator): Promise<void>;
  
  // Drag and drop operations
  dragVideoToPlaylist(videoCard: Locator, playlistButton: Locator): Promise<void>;
  dragPlaylistToPosition(fromIndex: number, toIndex: number): Promise<void>;
  reorderVideosInPlaylist(fromIndex: number, toIndex: number): Promise<void>;
  
  // Sort order operations
  changePlaylistSortOrder(sortKey: 'Custom' | 'Published At' | 'Title', order?: 'ascending' | 'descending'): Promise<void>;
  getCurrentSortOrder(): Promise<{ key: string; order: string }>;
  verifyDragDisabled(): Promise<void>;
  
  // Playlist page operations
  getPlaylistVideos(): Promise<Locator[]>;
  getPlaylistTitle(): Promise<string>;
  getNextVideosSection(): Promise<Locator | null>;
  
  // Continue watching integration
  getContinueWatchingSection(): Promise<Locator | null>;
  resumePlaylistFromContinueWatching(videoCard: Locator): Promise<void>;
  clickPlaylistTitleInCard(videoCard: Locator): Promise<void>;
}

export function createPlaylistHelpers(page: Page): PlaylistHelpers {
  return {
    async createPlaylist(): Promise<string> {
      const createPlaylistButton = page.getByTestId('create-playlist-button');
      await createPlaylistButton.waitFor();
      await createPlaylistButton.click();

      // Wait for the new playlist to appear
      const newPlaylistButton = page.getByTestId('playlist-button');
      await expect(newPlaylistButton).toHaveCount(1);
      
      // Get the playlist name
      const playlistName = await newPlaylistButton.textContent();
      return playlistName || 'New Playlist';
    },

    async deletePlaylist(playlistSelector = 'playlist-button'): Promise<void> {
      const playlistButton = page.getByTestId(playlistSelector);

      // Right-click to open context menu
      await playlistButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await expect(playlistContextMenu).toBeVisible();

      const deleteContextItem = page
        .getByTestId('playlist-context-item')
        .first();

      await deleteContextItem.click();

      // Wait for the playlist to be removed
      await expect(playlistButton).toHaveCount(0);
    },

    getPlaylistButton(index = 0) {
      return page.getByTestId('playlist-button').nth(index);
    },
    
    getPlaylistButtons() {
      return page.getByTestId('playlist-button');
    },

    async openPlaylistContextMenu(
      playlistSelector = 'playlist-button'
    ): Promise<void> {
      const playlistButton = page.getByTestId(playlistSelector);
      await playlistButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await expect(playlistContextMenu).toBeVisible();
    },

    async addCurrentVideoToPlaylist(): Promise<void> {
      // This assumes the context menu is already open
      const playlistContextItem = page
        .getByTestId('playlist-context-item')
        .first();

      await playlistContextItem.click();
    },
    
    async navigateToPlaylist(playlistName: string): Promise<void> {
      const playlistButton = page.getByTestId('playlist-button').filter({ hasText: playlistName });
      await playlistButton.click();
      await page.waitForURL(/\/playlist\//, { timeout: 10000 });
    },
    
    async navigateToHomepage(): Promise<void> {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    },
    
    async addVideoToPlaylist(videoCard: Locator, playlistName: string): Promise<void> {
      // Right-click on video to open context menu
      await videoCard.click({ button: 'right' });
      
      // Look for "Add to Playlist" option
      const addToPlaylistOption = page.getByText('Add to Playlist');
      await expect(addToPlaylistOption).toBeVisible();
      await addToPlaylistOption.click();
      
      // Select the specific playlist
      const playlistOption = page.getByText(playlistName);
      await expect(playlistOption).toBeVisible();
      await playlistOption.click();
    },
    
    async removeVideoFromPlaylist(videoCard: Locator): Promise<void> {
      // Right-click on video to open context menu
      await videoCard.click({ button: 'right' });
      
      // Look for "Remove from Playlist" option
      const removeFromPlaylistOption = page.getByText('Remove from Playlist');
      await expect(removeFromPlaylistOption).toBeVisible();
      await removeFromPlaylistOption.click();
    },
    
    async dragVideoToPlaylist(videoCard: Locator, playlistButton: Locator): Promise<void> {
      // Perform drag and drop operation
      await videoCard.dragTo(playlistButton);
      
      // Wait for any visual feedback or state change
      await page.waitForTimeout(500);
    },
    
    async dragPlaylistToPosition(fromIndex: number, toIndex: number): Promise<void> {
      const fromPlaylist = this.getPlaylistButton(fromIndex);
      const toPlaylist = this.getPlaylistButton(toIndex);
      
      await fromPlaylist.dragTo(toPlaylist);
      await page.waitForTimeout(500);
    },
    
    async reorderVideosInPlaylist(fromIndex: number, toIndex: number): Promise<void> {
      const videoCards = page.getByTestId('carousel-item');
      const fromVideo = videoCards.nth(fromIndex);
      const toVideo = videoCards.nth(toIndex);
      
      await fromVideo.dragTo(toVideo);
      await page.waitForTimeout(500);
    },
    
    async changePlaylistSortOrder(sortKey: 'Custom' | 'Published At' | 'Title', order?: 'ascending' | 'descending'): Promise<void> {
      // Look for sort dropdown or filter controls
      const sortDropdown = page.getByTestId('content-filter') || page.getByRole('combobox', { name: /sort/i });
      
      if (await sortDropdown.isVisible()) {
        await sortDropdown.click();
        
        // Select the sort key
        const sortOption = page.getByText(sortKey);
        await expect(sortOption).toBeVisible();
        await sortOption.click();
        
        // If order is specified and not Custom
        if (order && sortKey !== 'Custom') {
          const orderOption = page.getByText(order);
          if (await orderOption.isVisible()) {
            await orderOption.click();
          }
        }
      }
    },
    
    async getCurrentSortOrder(): Promise<{ key: string; order: string }> {
      // Check URL parameters for sort order
      const url = new URL(page.url());
      const sortKey = url.searchParams.get('playlistOrder') || url.searchParams.get('datePublished') || url.searchParams.get('title') || 'Custom';
      const order = url.searchParams.get(sortKey === 'Custom' ? 'playlistOrder' : sortKey) || 'ascending';
      
      return { key: sortKey, order };
    },
    
    async verifyDragDisabled(): Promise<void> {
      const videoCards = page.getByTestId('carousel-item');
      if (await videoCards.count() > 1) {
        const firstVideo = videoCards.first();
        
        // Try to drag - it should not work when sort is not Custom
        const initialPosition = await firstVideo.boundingBox();
        await firstVideo.dragTo(videoCards.nth(1));
        const newPosition = await firstVideo.boundingBox();
        
        // Position should not have changed significantly
        expect(Math.abs((initialPosition?.x || 0) - (newPosition?.x || 0))).toBeLessThan(10);
      }
    },
    
    async getPlaylistVideos(): Promise<Locator[]> {
      const videoCards = page.getByTestId('carousel-item');
      const count = await videoCards.count();
      const videos = [];
      
      for (let i = 0; i < count; i++) {
        videos.push(videoCards.nth(i));
      }
      
      return videos;
    },
    
    async getPlaylistTitle(): Promise<string> {
      const titleElement = page.getByRole('heading', { level: 2 });
      return await titleElement.textContent() || '';
    },
    
    async getNextVideosSection(): Promise<Locator | null> {
      const nextSection = page.getByText('Up Next').or(page.getByText('Next Videos'));
      const isVisible = await nextSection.isVisible();
      return isVisible ? nextSection : null;
    },
    
    async getContinueWatchingSection(): Promise<Locator | null> {
      const continueWatchingSection = page
        .locator('text=Continue Watching')
        .or(page.getByRole('heading', { name: /continue watching/i }));

      const isVisible = await continueWatchingSection.isVisible();
      return isVisible ? continueWatchingSection : null;
    },
    
    async resumePlaylistFromContinueWatching(videoCard: Locator): Promise<void> {
      await videoCard.click();
      await page.waitForURL(/\/playlist\/.*\/video\//, { timeout: 10000 });
    },
    
    async clickPlaylistTitleInCard(videoCard: Locator): Promise<void> {
      // Look for playlist title link within the video card
      const playlistLink = videoCard.locator('a[href*="/playlist/"]');
      await expect(playlistLink).toBeVisible();
      await playlistLink.click();
      await page.waitForURL(/\/playlist\//, { timeout: 10000 });
    },
  };
}

