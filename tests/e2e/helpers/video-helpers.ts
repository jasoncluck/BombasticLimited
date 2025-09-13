import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Helper functions for video-related E2E tests
 */

type ViewMode = 'card' | 'table' | 'unknown';

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
   * Check if we're currently on a video page (where dropdowns are always visible)
   */
  private isVideoPage(): boolean {
    const currentUrl = this.page.url();
    // Video page patterns: /video/[id] or /playlist/[shortId]/video/[videoId]
    return /\/video\/[^/]+(?:\/.*)?$/.test(currentUrl);
  }

  /**
   * Open content dropdown for a video card
   */
  async openContentDropdown(videoCard: Locator): Promise<Locator | null> {
    // Only hover for content cards, not for video pages where dropdown is always visible
    if (!this.isVideoPage()) {
      await videoCard.hover();
    }

    const dropdownTrigger = videoCard
      .locator('button[aria-haspopup]')
      .or(
        videoCard.locator('button').filter({ hasText: /⋮|⋯|•••|\.\.\.|menu/i })
      )
      .or(videoCard.locator('[data-testid="content-dropdown"]'))
      .or(videoCard.locator('[data-testid="content-dropdown-trigger"]'))
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
    // First check which view mode we're in and get the appropriate elements
    const currentMode = await this.getCurrentViewMode();

    let videoItems: Locator;

    if (currentMode === 'table') {
      // In table mode, look for table rows
      videoItems = this.page
        .locator('tr[data-testid*="video"], tbody tr')
        .filter({ hasText: /.+/ });
    } else {
      // In card/carousel mode, use carousel items
      videoItems = this.page.getByTestId('carousel-item');
    }

    const itemCount = await videoItems.count();

    if (indices.some((i) => i >= itemCount)) {
      throw new Error(
        `Video index out of range. Requested: ${indices}, Available: ${itemCount}`
      );
    }

    if (useShift && indices.length === 2) {
      // Shift selection: click first, then shift+click last
      await videoItems.nth(indices[0]).click();
      await this.page.waitForTimeout(200); // Small delay between clicks
      await videoItems.nth(indices[1]).click({ modifiers: ['Shift'] });
    } else {
      // Ctrl/Cmd selection: click each with modifier
      const modifierKey = process.platform === 'darwin' ? 'Meta' : 'Control';

      for (const index of indices) {
        await videoItems.nth(index).click({ modifiers: [modifierKey] });
        await this.page.waitForTimeout(100); // Small delay between clicks
      }
    }

    return videoItems;
  }

  /**
   * Check for visual selection indicators
   */
  async getSelectionIndicators(): Promise<Locator> {
    // Check for various selection indicators that might be used in different view modes
    const selectionIndicators = this.page
      .locator(
        '.selected, [data-selected="true"], [aria-selected="true"], .bg-primary, .bg-accent'
      )
      .or(
        this.page.locator(
          'tr.selected, tr[data-selected="true"], tr[aria-selected="true"]'
        )
      )
      .or(this.page.locator('[class*="selected"], [class*="highlight"]'));

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

  /**
   * Wait for basic page content to load before attempting view operations
   */
  async waitForPageContent(): Promise<void> {
    // Wait for either navigation elements to be present (indicating page structure is ready)
    try {
      await this.page.waitForSelector(
        '[data-testid="user-preferences"], [data-testid="content-item"], [data-testid="carousel-item"], [data-testid="content-table-defaultSection"]',
        {
          timeout: 15000,
          state: 'visible',
        }
      );
    } catch (e) {
      // If no content elements are found, wait a bit longer and try again
      await this.page.waitForTimeout(3000);

      // Check if we're on a page that might need authentication or has different structure
      const bodyContent = await this.page.textContent('body');
      if (
        (bodyContent && bodyContent.includes('Loading')) ||
        (bodyContent && bodyContent.includes('loading'))
      ) {
        await this.page.waitForTimeout(5000); // Wait for loading to complete
      }
    }
  }

  /**
   * Switch to card view mode (TILES)
   */
  async switchToCardView(): Promise<void> {
    // First, wait for the page to have some basic content loaded
    await this.waitForPageContent();

    // Click on the user preferences dropdown (desktop only)
    const userPreferences = this.page.getByTestId('user-preferences');

    // Check if the preferences dropdown is available (authenticated + desktop)
    if (await userPreferences.isVisible({ timeout: 5000 })) {
      // Check current mode first
      const currentMode = await this.getCurrentViewMode();

      if (currentMode === 'card') {
        // Already in card mode, but let's verify content is visible
        const contentItem = this.page.getByTestId('content-item').first();
        const isContentVisible = await contentItem
          .isVisible()
          .catch(() => false);

        if (isContentVisible) {
          // Content is already visible, wait a bit to ensure stability
          await this.page.waitForTimeout(1000);
          return;
        }
        // If not visible, continue with switching
      }

      await userPreferences.click();

      // Look for the Card option in the dropdown
      const cardOption = this.page
        .locator('[role="menuitem"]')
        .filter({ hasText: /Card/i });

      if (await cardOption.isVisible({ timeout: 5000 })) {
        await cardOption.click();
        // Wait for the view to change
        await this.page.waitForTimeout(4000);

        // Wait for card content to be visible with robust checking
        let attempts = 0;
        const maxAttempts = 8;
        while (attempts < maxAttempts) {
          const contentItem = this.page.getByTestId('content-item').first();
          const isVisible = await contentItem.isVisible().catch(() => false);
          if (isVisible) {
            // Success - cards are visible
            await this.page.waitForTimeout(1500); // Additional stability wait
            return;
          }

          attempts++;
          if (attempts < maxAttempts) {
            await this.page.waitForTimeout(2000); // Wait before retry
          }
        }

        throw new Error(
          'Failed to switch to card view - content items not visible after mode switch'
        );
      } else {
        // If Card option is not visible, check if we're already in card mode
        const contentItem = this.page.getByTestId('content-item').first();
        const isContentVisible = await contentItem
          .isVisible()
          .catch(() => false);

        if (!isContentVisible) {
          throw new Error(
            'Card option not found in preferences and content items not visible'
          );
        }

        // Click elsewhere to close the dropdown
        await this.page.click('body');
      }
    } else {
      // If preferences dropdown is not available, wait for content to load first
      await this.waitForPageContent();

      // Then check if cards are visible
      const contentItem = this.page.getByTestId('content-item').first();
      const isContentVisible = await contentItem
        .isVisible({ timeout: 10000 })
        .catch(() => false);

      if (!isContentVisible) {
        // Try waiting for carousel items as fallback (for homepage)
        const carouselItem = this.page.getByTestId('carousel-item').first();
        const isCarouselVisible = await carouselItem
          .isVisible({ timeout: 5000 })
          .catch(() => false);

        if (!isCarouselVisible) {
          throw new Error(
            'User preferences not available and no content items visible - page may not be fully loaded'
          );
        }
      }
    }

    // Final verification that card mode is active
    const contentItem = this.page.getByTestId('content-item').first();
    await contentItem.waitFor({ state: 'visible', timeout: 15000 });

    // Additional wait to ensure content is fully loaded
    await this.page.waitForTimeout(1500);
  }

  /**
   * Switch to table view mode (TABLE)
   */
  async switchToTableView(): Promise<void> {
    // First, wait for the page to have some basic content loaded
    await this.waitForPageContent();

    // Click on the user preferences dropdown (desktop only)
    const userPreferences = this.page.getByTestId('user-preferences');

    // Check if the preferences dropdown is available (authenticated + desktop)
    if (await userPreferences.isVisible({ timeout: 5000 })) {
      // Check current mode first
      const currentMode = await this.getCurrentViewMode();

      if (currentMode === 'table') {
        // Already in table mode, but let's verify the table is actually visible
        const table = this.page
          .getByTestId('content-table-defaultSection')
          .first();
        const isTableVisible = await table.isVisible().catch(() => false);

        if (isTableVisible) {
          // Table is already visible, wait a bit to ensure stability
          await this.page.waitForTimeout(1000);
          return;
        }
        // If not visible, continue with switching
      }

      await userPreferences.click();

      // Look for the Table option in the dropdown
      const tableOption = this.page
        .locator('[role="menuitem"]')
        .filter({ hasText: /Table/i });

      if (await tableOption.isVisible({ timeout: 3000 })) {
        await tableOption.click();
        // Wait longer for the view to change and table to be rendered
        await this.page.waitForTimeout(3000);

        // Wait specifically for the table to be visible with more robust checking
        const table = this.page
          .getByTestId('content-table-defaultSection')
          .first();

        // Try multiple times to ensure the table appears
        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
          const isVisible = await table.isVisible().catch(() => false);
          if (isVisible) {
            // Verify we have table rows
            const rows = table.locator('tr');
            const rowCount = await rows.count();
            if (rowCount > 0) {
              // Success - table is visible with content
              await this.page.waitForTimeout(1000); // Additional stability wait
              return;
            }
          }

          attempts++;
          if (attempts < maxAttempts) {
            await this.page.waitForTimeout(2000); // Wait before retry
          }
        }

        // If we get here, the switch may have failed
        throw new Error(
          'Failed to switch to table view - table not visible or no rows found'
        );
      } else {
        // If Table option is not visible, check if we're already in table mode
        const table = this.page
          .getByTestId('content-table-defaultSection')
          .first();
        const isTableVisible = await table.isVisible().catch(() => false);

        if (!isTableVisible) {
          throw new Error(
            'Table option not found in preferences and table not visible'
          );
        }

        // Click elsewhere to close the dropdown
        await this.page.click('body');
      }
    } else {
      // If preferences dropdown is not available, check if table is already visible
      const table = this.page
        .getByTestId('content-table-defaultSection')
        .first();
      const isTableVisible = await table.isVisible().catch(() => false);

      if (!isTableVisible) {
        throw new Error(
          'User preferences not available and table not visible - cannot switch to table mode'
        );
      }
    }

    // Final verification that table mode is active
    const table = this.page.getByTestId('content-table-defaultSection').first();
    await table.waitFor({ state: 'visible', timeout: 10000 });

    // Ensure table has content
    const rows = table.locator('tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      throw new Error(
        'Table is visible but has no rows - content may not be loaded'
      );
    }

    // Additional wait to ensure table content is fully loaded
    await this.page.waitForTimeout(1000);
  }

  /**
   * Get the current view mode by checking which icon is displayed
   */
  async getCurrentViewMode(): Promise<ViewMode> {
    const userPreferences = this.page.getByTestId('user-preferences');

    if (await userPreferences.isVisible({ timeout: 3000 })) {
      // Check the icon content to determine current mode
      const iconElement = userPreferences.locator('svg').first();

      if (await iconElement.isVisible()) {
        // Check for GalleryHorizontal icon (indicates card mode is active)
        const hasGalleryIcon = await userPreferences
          .locator('svg[class*="lucide-gallery"]')
          .isVisible()
          .catch(() => false);
        if (hasGalleryIcon) {
          return 'card';
        }

        // Check for Table icon (indicates table mode is active)
        const hasTableIcon = await userPreferences
          .locator('svg[class*="lucide-table"]')
          .isVisible()
          .catch(() => false);
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
  async switchViewMode(): Promise<ViewMode> {
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
  async getVideoCards(): Promise<Locator[]> {
    const videoCards = this.page.getByTestId('carousel-item');
    const count = await videoCards.count();
    const cards = [];

    for (let i = 0; i < count; i++) {
      cards.push(videoCards.nth(i));
    }

    return cards;
  }

  /**
   * Interact with YouTube player to generate timestamp (15+ seconds minimum)
   * This method clicks on the YouTube iframe to start playback and either waits
   * or scrubs the timeline to ensure a timestamp is saved
   */
  async watchVideoToGenerateTimestamp(
    options: {
      method?: 'wait' | 'scrub';
      waitSeconds?: number;
      scrubToSeconds?: number;
    } = {}
  ): Promise<void> {
    const { method = 'scrub', waitSeconds = 4, scrubToSeconds = 20 } = options;

    // Wait for the iframe to be visible
    const iframe = this.page.locator('iframe').first();
    await iframe.waitFor({ state: 'visible' });

    // Click on the iframe to start video playback
    await iframe.click({ position: { x: 100, y: 100 } });

    // Wait a moment for the click to register
    await this.page.waitForTimeout(2000);

    if (method === 'scrub') {
      // Scrub to a specific timestamp by clicking on the progress bar
      await this.scrubYouTubePlayer(scrubToSeconds);
    } else {
      await this.page.waitForTimeout(waitSeconds * 1000);
    }
  }

  /**
   * Parse YouTube time format (MM:SS or HH:MM:SS) to seconds
   */
  private parseYouTubeTime(timeString: string): number {
    const parts = timeString.trim().split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return 0;
  }

  /**
   * Scrub YouTube player to a specific timestamp by clicking on the progress bar
   */
  private async scrubYouTubePlayer(targetSeconds: number): Promise<void> {
    try {
      // Switch to iframe context to interact with YouTube player
      const iframe = this.page.locator('iframe').first();
      const frame = iframe.contentFrame();

      if (!frame) {
        console.warn(
          'Could not access YouTube iframe content, falling back to wait method'
        );
        await this.page.waitForTimeout(16000); // Fall back to waiting 16 seconds
        return;
      }

      // Wait for YouTube player UI to load
      await this.page.waitForTimeout(3000);

      // First, try to play the video if it's not already playing
      try {
        // Look for the play button (YouTube uses various selectors)
        const playButton = frame
          .locator(
            '.ytp-play-button, .ytp-large-play-button, [aria-label*="Play"], [title*="Play"], .html5-video-player .ytp-play-button'
          )
          .first();

        // Check if video is paused by looking for play button or paused state
        const isPaused =
          (await frame
            .locator(
              '.html5-video-player.paused-mode, .ytp-play-button[aria-label*="Play"]'
            )
            .count()) > 0;

        if (isPaused && (await playButton.isVisible({ timeout: 2000 }))) {
          await playButton.click();

          // Wait a moment for the video to start playing
          await this.page.waitForTimeout(1000);
        }
      } catch (playError) {
        console.warn('Could not interact with play button:', playError);
        // Continue with scrubbing attempt even if play failed
      }

      // Wait a bit more to ensure video is playing and UI is ready
      await this.page.waitForTimeout(2000);

      // Look for the progress bar (YouTube uses various selectors)
      const progressBar = frame
        .locator(
          '.ytp-progress-bar, .html5-progress-bar, [role="slider"], .ytp-progress-bar-container'
        )
        .first();

      if (await progressBar.isVisible({ timeout: 5000 })) {
        // Try to get video duration to calculate more accurate scrub position
        let videoDuration = 0;
        try {
          // Try to get duration from YouTube player API or DOM
          const durationElement = frame.locator(
            '.ytp-time-duration, .html5-video-duration'
          );
          if (await durationElement.isVisible({ timeout: 2000 })) {
            const durationText = await durationElement.textContent();
            if (durationText) {
              // Parse duration (format: "MM:SS" or "HH:MM:SS")
              const timeParts = durationText.trim().split(':').map(Number);
              if (timeParts.length === 2) {
                videoDuration = timeParts[0] * 60 + timeParts[1]; // MM:SS
              } else if (timeParts.length === 3) {
                videoDuration =
                  timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]; // HH:MM:SS
              }
            }
          }
        } catch (durationError) {
          console.warn('Could not determine video duration:', durationError);
        }

        // Get the width of the progress bar
        const progressBarBox = await progressBar.boundingBox();

        if (progressBarBox) {
          let scrubPosition = 0.2; // Default to 20% if we can't calculate

          // Calculate more accurate position if we have duration
          if (videoDuration > 0) {
            scrubPosition = Math.min(targetSeconds / videoDuration, 0.95); // Cap at 95% to avoid end of video
          }

          // Calculate click position
          const clickX =
            progressBarBox.x + progressBarBox.width * scrubPosition;
          const clickY = progressBarBox.y + progressBarBox.height / 2;

          // Click on the progress bar to scrub to that position
          await progressBar.click({
            position: {
              x: clickX - progressBarBox.x,
              y: clickY - progressBarBox.y,
            },
          });

          // Wait longer for the scrub to take effect and stabilize
          // Increased from 2 seconds to 3 seconds for better reliability
          await this.page.waitForTimeout(3000);

          // Verify the video is still playing after scrub
          try {
            const isStillPaused =
              (await frame
                .locator(
                  '.html5-video-player.paused-mode, .ytp-play-button[aria-label*="Play"]'
                )
                .count()) > 0;
            if (isStillPaused) {
              const playButtonAfterScrub = frame
                .locator('.ytp-play-button')
                .first();
              if (await playButtonAfterScrub.isVisible({ timeout: 1000 })) {
                await playButtonAfterScrub.click();
              }
            }
          } catch (resumeError) {
            console.warn(
              'Could not verify/resume playback after scrub:',
              resumeError
            );
          }

          // Additional wait to ensure the video state is fully registered
          // This gives the video time to buffer and stabilize at the new position
          await this.page.waitForTimeout(3000);

          // Verify the scrub was successful by checking current time position
          let scrubSuccessful = false;
          try {
            const currentTimeElement = frame.locator(
              '.ytp-time-current, .html5-video-current-time'
            );
            if (await currentTimeElement.isVisible({ timeout: 2000 })) {
              const currentTimeText = await currentTimeElement.textContent();
              if (currentTimeText) {
                const actualPosition = this.parseYouTubeTime(currentTimeText);
                const tolerance = 5; // Allow 5 second tolerance
                const positionDifference = Math.abs(
                  actualPosition - targetSeconds
                );

                if (positionDifference <= tolerance) {
                  scrubSuccessful = true;
                } else {
                  console.warn(
                    `✗ Scrub position verification failed: expected ~${targetSeconds}s, got ${actualPosition}s`
                  );
                }
              }
            }
          } catch (timeCheckError) {
            console.warn('Could not verify scrub position:', timeCheckError);
          }

          // Final verification that video is playing with enhanced stability
          try {
            const finalPauseCheck =
              (await frame
                .locator(
                  '.html5-video-player.paused-mode, .ytp-play-button[aria-label*="Play"]'
                )
                .count()) > 0;

            if (finalPauseCheck) {
              const finalPlayButton = frame.locator('.ytp-play-button').first();
              if (await finalPlayButton.isVisible({ timeout: 1000 })) {
                await finalPlayButton.click();
                // Wait after final play attempt for stability
                await this.page.waitForTimeout(1000);
              }
            }
            // Additional wait to ensure stable playback at new position
            // This helps prevent intermittent issues where playback state changes
            await this.page.waitForTimeout(2000);
          } catch (finalVerifyError) {
            console.warn(
              'Could not perform final playback verification:',
              finalVerifyError
            );
          }
        } else {
          console.warn(
            'Could not get progress bar dimensions, falling back to wait method'
          );
          console.log('Fallback: waiting 16 seconds for video progression...');
          await this.page.waitForTimeout(16000);
        }
      } else {
        console.warn(
          'Could not find YouTube progress bar, falling back to wait method'
        );
        console.log('Fallback: waiting 16 seconds for video progression...');
        await this.page.waitForTimeout(16000);
      }
    } catch (error) {
      console.error(
        '❌ YouTube player scrubbing failed, falling back to wait method:',
        error
      );
      console.log('Fallback: waiting 16 seconds for video progression...');
      await this.page.waitForTimeout(16000); // Fall back to waiting 16 seconds
    }
  }

  /**
   * Start video playback by clicking the YouTube player
   */
  async startVideoPlayback(): Promise<void> {
    const iframe = this.page.locator('iframe').first();
    await expect(iframe).toBeVisible({ timeout: 10000 });

    // Click in the center of the iframe to start playback
    await iframe.click({ position: { x: 200, y: 150 } });

    // Wait for playback to start
    await this.page.waitForTimeout(2000);
  }
}
