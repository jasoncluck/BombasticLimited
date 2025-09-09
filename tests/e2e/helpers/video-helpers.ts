import { type Page } from '@playwright/test';

/**
 * Backward compatibility wrapper for VideoHelpers
 * This provides the same interface as the old VideoHelpers class
 * but uses the new fixture pattern internally.
 */
export class VideoHelpers {
  constructor(private page: Page) {}

  /**
   * Get the first available video card from the carousel
   */
  async getFirstVideoCard() {
    const videoCard = this.page.getByTestId('carousel-item').first();
    return videoCard;
  }

  /**
   * Get video title from a video card
   */
  async getVideoTitle(videoCard: any): Promise<string | null> {
    return await videoCard.locator('p').first().textContent();
  }

  /**
   * Navigate to a video by clicking on its card
   */
  async navigateToVideo(videoCard: any) {
    await videoCard.click();
    await this.page.waitForURL(/\/video\//, { timeout: 10000 });

    const iframe = this.page.locator('iframe').first();
    return iframe;
  }

  /**
   * Check if continue watching section exists and return it
   */
  async getContinueWatchingSection() {
    const continueWatchingSection = this.page
      .locator('text=Continue Watching')
      .or(this.page.getByRole('heading', { name: /continue watching/i }));

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

    const continueVideos = this.page
      .locator('[data-testid="continue-video"]')
      .or(
        this.page
          .locator('[data-testid="carousel-item"]')
          .filter({ hasText: /continue/i })
      );

    const videos = await continueVideos.all();
    return videos;
  }

  /**
   * Check if a video has a progress indicator
   */
  async hasProgressIndicator(videoCard: any): Promise<boolean> {
    const progressIndicator = videoCard
      .locator('[data-testid="video-progress"]')
      .or(videoCard.locator('.progress-bar'));

    return await progressIndicator.isVisible();
  }

  /**
   * Check if a video is marked as watched
   */
  async isVideoWatched(videoCard: any): Promise<boolean> {
    const watchedIndicator = videoCard
      .locator('text=watched')
      .or(videoCard.locator('[data-testid="watched-indicator"]'));

    return await watchedIndicator.isVisible();
  }

  /**
   * Open context menu for a video card
   */
  async openContextMenu(videoCard: any) {
    await videoCard.click({ button: 'right' });

    const contextMenu = this.page
      .locator(
        '[role="menu"][data-state="open"], .context-menu[data-state="open"], [data-testid="context-menu"][data-state="open"]'
      )
      .first();

    const isVisible = await contextMenu
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    return isVisible ? contextMenu : null;
  }

  /**
   * Open content dropdown for a video card
   */
  async openContentDropdown(videoCard: any) {
    const dropdownTrigger = videoCard
      .locator('button[aria-haspopup]')
      .or(
        videoCard.locator('button').filter({ hasText: /⋮|⋯|•••|\.\.\.|menu/i })
      )
      .or(videoCard.locator('[data-testid="content-dropdown"]'))
      .or(videoCard.locator('button').last());

    if (await dropdownTrigger.isVisible()) {
      await dropdownTrigger.click();

      const dropdownMenu = this.page
        .locator(
          '[role="menu"][data-state="open"], .dropdown-menu[data-state="open"], [data-testid="dropdown-menu"][data-state="open"], [data-testid="content-dropdown-content"][data-state="open"]'
        )
        .first();

      const isVisible = await dropdownMenu
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      return isVisible ? dropdownMenu : null;
    }

    return null;
  }

  /**
   * Mark a video as watched through UI interaction
   */
  async markVideoAsWatched(videoCard: any): Promise<boolean> {
    const contextMenu = await this.openContextMenu(videoCard);

    if (contextMenu) {
      const watchedOption = contextMenu
        .locator('text=watched', { hasText: /mark|set|as/ })
        .or(contextMenu.locator('[data-testid="mark-watched"]'))
        .first();

      if (await watchedOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await watchedOption.click();
        return true;
      }
    }

    const dropdownMenu = await this.openContentDropdown(videoCard);

    if (dropdownMenu) {
      const watchedOption = dropdownMenu.locator('text=watched').first();

      if (await watchedOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await watchedOption.click();
        return true;
      }
    }

    return false;
  }

  /**
   * Reset video progress through UI interaction
   */
  async resetVideoProgress(videoCard: any): Promise<boolean> {
    const contextMenu = await this.openContextMenu(videoCard);

    if (contextMenu) {
      const resetOption = contextMenu
        .locator('text=Reset')
        .or(contextMenu.locator('[data-testid="reset-progress"]'))
        .first();

      if (await resetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resetOption.click();
        return true;
      }
    }

    return false;
  }

  /**
   * Perform multi-selection of video cards
   */
  async multiSelectVideos(
    indices: number[],
    useShift = false
  ) {
    const currentMode = await this.getCurrentViewMode();
    
    let videoItems;
    
    if (currentMode === 'table') {
      videoItems = this.page.locator('tr[data-testid*="video"], tbody tr').filter({ hasText: /.+/ });
    } else {
      videoItems = this.page.getByTestId('carousel-item');
    }
    
    const itemCount = await videoItems.count();

    if (indices.some((i) => i >= itemCount)) {
      throw new Error(`Video index out of range. Requested: ${indices}, Available: ${itemCount}`);
    }

    if (useShift && indices.length === 2) {
      await videoItems.nth(indices[0]).click();
      await this.page.waitForTimeout(200);
      await videoItems.nth(indices[1]).click({ modifiers: ['Shift'] });
    } else {
      const modifierKey = process.platform === 'darwin' ? 'Meta' : 'Control';

      for (const index of indices) {
        await videoItems.nth(index).click({ modifiers: [modifierKey] });
        await this.page.waitForTimeout(100);
      }
    }

    return videoItems;
  }

  /**
   * Check for visual selection indicators
   */
  async getSelectionIndicators() {
    const selectionIndicators = this.page
      .locator('.selected, [data-selected="true"], [aria-selected="true"], .bg-primary, .bg-accent')
      .or(this.page.locator('tr.selected, tr[data-selected="true"], tr[aria-selected="true"]'))
      .or(this.page.locator('[class*="selected"], [class*="highlight"]'));

    return selectionIndicators;
  }

  /**
   * Navigate back to homepage
   */
  async goToHomepage(): Promise<void> {
    await this.page.goto('/');
  }

  /**
   * Wait for video operations to complete
   */
  async waitForOperation(timeoutMs = 2000): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  /**
   * Switch to card view mode (TILES)
   */
  async switchToCardView(): Promise<void> {
    const userPreferences = this.page.getByTestId('user-preferences');
    
    if (await userPreferences.isVisible({ timeout: 3000 })) {
      await userPreferences.click();
      
      const cardOption = this.page.locator('[role="menuitem"]').filter({ hasText: /Card/i });
      
      if (await cardOption.isVisible({ timeout: 3000 })) {
        await cardOption.click();
        await this.page.waitForTimeout(1500);
      } else {
        await this.page.click('body');
      }
    }
  }

  /**
   * Switch to table view mode (TABLE)
   */
  async switchToTableView(): Promise<void> {
    const userPreferences = this.page.getByTestId('user-preferences');
    
    if (await userPreferences.isVisible({ timeout: 3000 })) {
      await userPreferences.click();
      
      const tableOption = this.page.locator('[role="menuitem"]').filter({ hasText: /Table/i });
      
      if (await tableOption.isVisible({ timeout: 3000 })) {
        await tableOption.click();
        await this.page.waitForTimeout(1500);
      } else {
        await this.page.click('body');
      }
    }
  }

  /**
   * Get the current view mode by checking which icon is displayed
   */
  async getCurrentViewMode(): Promise<'card' | 'table' | 'unknown'> {
    const userPreferences = this.page.getByTestId('user-preferences');
    
    if (await userPreferences.isVisible({ timeout: 3000 })) {
      const iconElement = userPreferences.locator('svg').first();
      
      if (await iconElement.isVisible()) {
        const hasGalleryIcon = await userPreferences.locator('svg[class*="lucide-gallery"]').isVisible().catch(() => false);
        if (hasGalleryIcon) {
          return 'card';
        }
        
        const hasTableIcon = await userPreferences.locator('svg[class*="lucide-table"]').isVisible().catch(() => false);
        if (hasTableIcon) {
          return 'table';
        }
      }
    }
    
    return 'unknown';
  }

  /**
   * Switch to the next view mode in the sequence
   */
  async switchViewMode(): Promise<'card' | 'table'> {
    const currentMode = await this.getCurrentViewMode();
    const targetMode = currentMode === 'card' ? 'table' : 'card';
    
    if (targetMode === 'card') {
      await this.switchToCardView();
    } else {
      await this.switchToTableView();
    }
    
    return targetMode;
  }

  /**
   * Get multiple video cards from the carousel
   */
  async getVideoCards() {
    const videoCards = this.page.getByTestId('carousel-item');
    const count = await videoCards.count();
    const cards = [];
    
    for (let i = 0; i < count; i++) {
      cards.push(videoCards.nth(i));
    }
    
    return cards;
  }
}