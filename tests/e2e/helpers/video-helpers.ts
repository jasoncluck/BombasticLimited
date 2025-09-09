import { expect, type Page } from '@playwright/test';

/**
 * Helper functions for video-related E2E tests
 */

export class VideoHelpers {
  constructor(private page: Page) {}

  /**
   * Get the first available video card from the carousel
   */
  async getFirstVideoCard() {
    const videoCard = this.page.getByTestId('carousel-item').first();
    await expect(videoCard).toBeVisible();
    return videoCard;
  }

  /**
   * Get video title from a video card
   */
  async getVideoTitle(videoCard: any) {
    return await videoCard.locator('p').first().textContent();
  }

  /**
   * Navigate to a video by clicking on its card
   */
  async navigateToVideo(videoCard: any) {
    await videoCard.click();
    await this.page.waitForURL(/\/video\//, { timeout: 10000 });
    
    // Verify iframe loads
    const iframe = this.page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    
    return iframe;
  }

  /**
   * Check if continue watching section exists and return it
   */
  async getContinueWatchingSection() {
    const continueWatchingSection = this.page.locator('text=Continue Watching').or(
      this.page.getByRole('heading', { name: /continue watching/i })
    );
    
    const isVisible = await continueWatchingSection.isVisible();
    return isVisible ? continueWatchingSection : null;
  }

  /**
   * Get continue watching videos if the section exists
   */
  async getContinueWatchingVideos() {
    const continueWatchingSection = await this.getContinueWatchingSection();
    if (!continueWatchingSection) {
      return [];
    }

    const continueVideos = this.page.locator('[data-testid="continue-video"]').or(
      this.page.locator('[data-testid="carousel-item"]').filter({ hasText: /continue/i })
    );

    const videos = await continueVideos.all();
    return videos;
  }

  /**
   * Check if a video has a progress indicator
   */
  async hasProgressIndicator(videoCard: any) {
    const progressIndicator = videoCard.locator('[data-testid="video-progress"]').or(
      videoCard.locator('.progress-bar')
    );
    
    return await progressIndicator.isVisible();
  }

  /**
   * Check if a video is marked as watched
   */
  async isVideoWatched(videoCard: any) {
    const watchedIndicator = videoCard.locator('text=watched').or(
      videoCard.locator('[data-testid="watched-indicator"]')
    );
    
    return await watchedIndicator.isVisible();
  }

  /**
   * Open context menu for a video card
   */
  async openContextMenu(videoCard: any) {
    await videoCard.click({ button: 'right' });
    
    const contextMenu = this.page.locator('[role="menu"]').or(
      this.page.locator('.context-menu')
    ).or(
      this.page.locator('[data-testid="context-menu"]')
    );
    
    const isVisible = await contextMenu.isVisible({ timeout: 3000 });
    return isVisible ? contextMenu : null;
  }

  /**
   * Open content dropdown for a video card
   */
  async openContentDropdown(videoCard: any) {
    const dropdownTrigger = videoCard.locator('button[aria-haspopup]').or(
      videoCard.locator('button').filter({ hasText: /⋮|⋯|•••|\.\.\.|menu/i })
    ).or(
      videoCard.locator('[data-testid="content-dropdown"]')
    ).or(
      videoCard.locator('button').last()
    );
    
    if (await dropdownTrigger.isVisible()) {
      await dropdownTrigger.click();
      
      const dropdownMenu = this.page.locator('[role="menu"]').or(
        this.page.locator('.dropdown-menu')
      ).or(
        this.page.locator('[data-testid="dropdown-menu"]')
      );
      
      const isVisible = await dropdownMenu.isVisible({ timeout: 3000 });
      return isVisible ? dropdownMenu : null;
    }
    
    return null;
  }

  /**
   * Mark a video as watched through UI interaction
   */
  async markVideoAsWatched(videoCard: any) {
    // Try context menu first
    const contextMenu = await this.openContextMenu(videoCard);
    
    if (contextMenu) {
      const watchedOption = contextMenu.locator('text=watched', { hasText: /mark|set|as/ }).or(
        contextMenu.locator('[data-testid="mark-watched"]')
      ).first();
      
      if (await watchedOption.isVisible({ timeout: 2000 })) {
        await watchedOption.click();
        return true;
      }
    }
    
    // Try dropdown menu if context menu doesn't work
    const dropdownMenu = await this.openContentDropdown(videoCard);
    
    if (dropdownMenu) {
      const watchedOption = dropdownMenu.locator('text=watched').first();
      
      if (await watchedOption.isVisible({ timeout: 2000 })) {
        await watchedOption.click();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Reset video progress through UI interaction
   */
  async resetVideoProgress(videoCard: any) {
    const contextMenu = await this.openContextMenu(videoCard);
    
    if (contextMenu) {
      const resetOption = contextMenu.locator('text=Reset').or(
        contextMenu.locator('[data-testid="reset-progress"]')
      ).first();
      
      if (await resetOption.isVisible({ timeout: 2000 })) {
        await resetOption.click();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Perform multi-selection of video cards
   */
  async multiSelectVideos(indices: number[], useShift = false) {
    const videoItems = this.page.getByTestId('carousel-item');
    const itemCount = await videoItems.count();
    
    if (indices.some(i => i >= itemCount)) {
      throw new Error('Video index out of range');
    }
    
    if (useShift && indices.length === 2) {
      // Shift selection: click first, then shift+click last
      await videoItems.nth(indices[0]).click();
      await videoItems.nth(indices[1]).click({ modifiers: ['Shift'] });
    } else {
      // Ctrl/Cmd selection: click each with modifier
      const modifierKey = process.platform === 'darwin' ? 'Meta' : 'Control';
      
      for (const index of indices) {
        await videoItems.nth(index).click({ modifiers: [modifierKey] });
      }
    }
    
    return videoItems;
  }

  /**
   * Check for visual selection indicators
   */
  async getSelectionIndicators() {
    const selectionIndicators = this.page.locator('.selected, [data-selected="true"], .bg-primary').or(
      this.page.locator('[aria-selected="true"]')
    );
    
    return selectionIndicators;
  }

  /**
   * Navigate back to homepage
   */
  async goToHomepage() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    
    // Verify we're on homepage
    await expect(this.page.getByRole('heading', { name: 'Latest Videos' })).toBeVisible();
  }

  /**
   * Wait for video operations to complete
   */
  async waitForOperation(timeoutMs = 2000) {
    await this.page.waitForTimeout(timeoutMs);
  }
}