import type { Page } from '@playwright/test';
import { waitForPageContent, waitForNavigationWithContent } from './wait-for-content';
import type { WaitForContentOptions } from './wait-for-content';

/**
 * Base class for Page Objects using Option 3 approach
 * This provides a foundation for creating page objects that use content-specific waiting
 * instead of generic load state waiting
 */
export abstract class PageObjectBase {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the page and wait for its content to load
   * Subclasses should override getPageContentIndicators() to define what content to wait for
   */
  async navigate(url?: string, options: WaitForContentOptions = {}): Promise<void> {
    if (url) {
      await this.page.goto(url);
    }
    
    const contentIndicators = this.getPageContentIndicators();
    await waitForPageContent(this.page, contentIndicators, options);
  }

  /**
   * Perform an action that triggers navigation and wait for the new page content
   */
  async navigateWithAction(
    navigationAction: () => Promise<void>,
    expectedContent?: { text?: string[]; testIds?: string[]; selectors?: string[] },
    options: WaitForContentOptions = {}
  ): Promise<void> {
    const contentToWaitFor = expectedContent || this.getPageContentIndicators();
    await waitForNavigationWithContent(this.page, navigationAction, contentToWaitFor, options);
  }

  /**
   * Check if the page is loaded by verifying its content indicators
   */
  async isLoaded(options: WaitForContentOptions = { timeout: 5000 }): Promise<boolean> {
    try {
      const contentIndicators = this.getPageContentIndicators();
      await waitForPageContent(this.page, contentIndicators, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Subclasses should implement this to define what content indicates the page is loaded
   */
  protected abstract getPageContentIndicators(): {
    text?: string[];
    testIds?: string[];
    selectors?: string[];
  };
}