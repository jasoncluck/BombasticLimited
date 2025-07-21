import type { Page } from '@playwright/test';
import { PageObjectBase } from '../helpers/page-object-base';
import { TestDataHelpers } from '../helpers/test-data-helpers';
import { waitForSelector, waitForTextContent } from '../helpers/wait-for-content';
import type { WaitForContentOptions } from '../helpers/wait-for-content';

/**
 * Video page object demonstrating Option 3 approach for video-specific content
 */
export class VideoPage extends PageObjectBase {
  constructor(page: Page) {
    super(page);
  }

  protected getPageContentIndicators() {
    return TestDataHelpers.getVideoPageContentIndicators();
  }

  /**
   * Navigate to a specific video and wait for content to load
   * OLD: await page.goto(`/video/${videoId}`); await page.waitForLoadState('load');
   * NEW: Navigate and wait for specific video content
   */
  async navigateToVideo(videoId: string, options: WaitForContentOptions = {}): Promise<void> {
    await this.navigate(`/video/${videoId}`, options);
  }

  /**
   * Wait for video player to be ready
   * More specific than waitForLoadState as it ensures the player is actually loaded
   */
  async waitForVideoPlayer(options: WaitForContentOptions = {}): Promise<void> {
    await waitForSelector(this.page, '[data-testid="video-player"]', options);
    // Also wait for player controls to ensure it's fully loaded
    await waitForSelector(this.page, '[data-testid="video-controls"]', { ...options, timeout: 10000 });
  }

  /**
   * Wait for video metadata to load
   */
  async waitForVideoMetadata(options: WaitForContentOptions = {}): Promise<void> {
    await waitForSelector(this.page, '[data-testid="video-title"]', options);
    await waitForSelector(this.page, '[data-testid="video-description"]', options);
  }

  /**
   * Wait for related videos section to load
   */
  async waitForRelatedVideos(options: WaitForContentOptions = {}): Promise<void> {
    await waitForTextContent(this.page, 'Related Videos', options);
    await waitForSelector(this.page, '[data-testid="related-videos"]', options);
  }

  /**
   * Play video and wait for playback to start
   * OLD: await page.click('.play-button'); await page.waitForTimeout(2000);
   * NEW: Click play and wait for actual playback indicators
   */
  async playVideo(options: WaitForContentOptions = {}): Promise<void> {
    await this.page.click('[data-testid="play-button"]');
    // Wait for video to actually start playing
    await waitForSelector(this.page, '[data-testid="video-playing"]', options);
  }
}