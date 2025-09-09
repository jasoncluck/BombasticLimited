import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Helper functions for video-related E2E tests
 */

export class VideoHelpers {
  constructor(private page: Page) {}

  /**
   * Get the first available video card from the carousel
   */
  async getFirstVideoCard(): Promise<Locator> {
    const videoCard = this.page.getByTestId('carousel-item').first();
    await expect(videoCard).toBeVisible();
    return videoCard;
  }

  /**
   * Get video title from a video card
   */
  async getVideoTitle(videoCard: Locator): Promise<string | null> {
    return await videoCard.locator('p').first().textContent();
  }

  /**
   * Navigate to a video by clicking on its card
   */
  async navigateToVideo(videoCard: Locator): Promise<Locator> {
    await videoCard.click();
    await this.page.waitForURL(/\/video\//, { timeout: 10000 });

    // Verify iframe loads
    const iframe = this.page.locator('iframe').first();
    await expect(iframe).toBeVisible({ timeout: 10000 });

    return iframe;
  }

  /**
   * Check if continue watching section exists and return it
   */
  async getContinueWatchingSection(): Promise<Locator | null> {
    const continueWatchingSection = this.page
      .locator('text=Continue Watching')
      .or(this.page.getByRole('heading', { name: /continue watching/i }));

    const isVisible = await continueWatchingSection.isVisible();
    return isVisible ? continueWatchingSection : null;
  }

  /**
   * Get continue watching videos if the section exists
   */
  async getContinueWatchingVideos(): Promise<Locator[]> {
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
  async hasProgressIndicator(videoCard: Locator): Promise<boolean> {
    const progressIndicator = videoCard
      .locator('[data-testid="video-progress"]')
      .or(videoCard.locator('.progress-bar'));

    return await progressIndicator.isVisible();
  }

  /**
   * Check if a video is marked as watched
   */
  async isVideoWatched(videoCard: Locator): Promise<boolean> {
    const watchedIndicator = videoCard
      .locator('text=watched')
      .or(videoCard.locator('[data-testid="watched-indicator"]'));

    return await watchedIndicator.isVisible();
  }

  /**
   * Open context menu for a video card
   */
  async openContextMenu(videoCard: Locator): Promise<Locator | null> {
    await videoCard.click({ button: 'right' });

    // Target only open context menus to avoid strict mode matching multiple elements
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
  async openContentDropdown(videoCard: Locator): Promise<Locator | null> {
    const dropdownTrigger = videoCard
      .locator('button[aria-haspopup]')
      .or(
        videoCard.locator('button').filter({ hasText: /⋮|⋯|•••|\.\.\.|menu/i })
      )
      .or(videoCard.locator('[data-testid="content-dropdown"]'))
      .or(videoCard.locator('button').last());

    if (await dropdownTrigger.isVisible()) {
      await dropdownTrigger.click();

      // Narrow the selector to only elements that are currently open (data-state="open").
      // This prevents Playwright strict mode violations when multiple menus exist in the DOM.
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
  async markVideoAsWatched(videoCard: Locator): Promise<boolean> {
    // Try context menu first
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

    // Try dropdown menu if context menu doesn't work
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
  async resetVideoProgress(videoCard: Locator): Promise<boolean> {
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
  ): Promise<Locator> {
    const videoItems = this.page.getByTestId('carousel-item');
    const itemCount = await videoItems.count();

    if (indices.some((i) => i >= itemCount)) {
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
  async getSelectionIndicators(): Promise<Locator> {
    const selectionIndicators = this.page
      .locator('.selected, [data-selected="true"], .bg-primary')
      .or(this.page.locator('[aria-selected="true"]'));

    return selectionIndicators;
  }

  /**
   * Navigate back to homepage
   */
  async goToHomepage(): Promise<void> {
    await this.page.goto('/');

    // Verify we're on homepage
    await expect(
      this.page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  }

  /**
   * Wait for video operations to complete
   */
  async waitForOperation(timeoutMs = 2000): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }
}

