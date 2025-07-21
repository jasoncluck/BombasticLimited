import type { Page } from '@playwright/test';
import { PageObjectBase } from '../helpers/page-object-base';
import { TestDataHelpers } from '../helpers/test-data-helpers';
import { waitForTextContent, waitForSelector } from '../helpers/wait-for-content';
import type { WaitForContentOptions } from '../helpers/wait-for-content';

/**
 * Main page object using Option 3 approach
 * Demonstrates how to replace waitForLoadState with content-specific waiting
 */
export class MainPage extends PageObjectBase {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Define what content indicates the main page is loaded
   * This replaces generic waitForLoadState with specific content checks
   */
  protected getPageContentIndicators() {
    return TestDataHelpers.getMainPageContentIndicators();
  }

  /**
   * Navigate to main page and wait for content to load
   * OLD APPROACH: await page.goto('/'); await page.waitForLoadState('domcontentloaded');
   * NEW APPROACH: Wait for specific content that indicates the page is ready
   */
  async navigateToMain(options: WaitForContentOptions = {}): Promise<void> {
    await this.navigate('/', options);
  }

  /**
   * Wait for the latest videos section to load
   * This demonstrates waiting for specific content rather than load states
   */
  async waitForLatestVideosSection(options: WaitForContentOptions = {}): Promise<void> {
    await waitForTextContent(this.page, 'Latest Videos', options);
    await waitForSelector(this.page, '[data-testid="latest-videos-section"]', options);
  }

  /**
   * Wait for continue watching section to appear (if user is logged in)
   */
  async waitForContinueWatchingSection(options: WaitForContentOptions = {}): Promise<boolean> {
    try {
      await waitForTextContent(this.page, 'Continue Watching', { ...options, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for source sections to load (e.g., Giant Bomb, Jeff Gerstmann, etc.)
   */
  async waitForSourceSections(expectedSources: string[], options: WaitForContentOptions = {}): Promise<void> {
    await Promise.all(
      expectedSources.map(source => 
        waitForTextContent(this.page, source, options)
      )
    );
  }

  /**
   * Example of how to replace a navigation with waitForLoadState
   * OLD: await page.click('a[href="/playlists"]'); await page.waitForLoadState('networkidle');
   * NEW: Click and wait for specific playlist content
   */
  async navigateToPlaylists(options: WaitForContentOptions = {}): Promise<void> {
    await this.navigateWithAction(
      () => this.page.click('a[href="/playlists"]'),
      TestDataHelpers.getPlaylistPageContentIndicators(),
      options
    );
  }

  /**
   * Example of clicking on a video and waiting for video page content
   */
  async clickFirstVideo(options: WaitForContentOptions = {}): Promise<void> {
    await this.navigateWithAction(
      () => this.page.click('[data-testid="video-card"]:first-child'),
      TestDataHelpers.getVideoPageContentIndicators(),
      options
    );
  }
}