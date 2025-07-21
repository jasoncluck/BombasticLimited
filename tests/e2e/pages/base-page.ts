import { type Page, type Locator, expect } from "@playwright/test";
import { TestUtils } from "../utils/test-utils";

export class BasePage {
  protected testUtils: TestUtils;

  constructor(public page: Page) {
    this.testUtils = new TestUtils(page);
  }

  async goto(path: string = "/"): Promise<void> {
    await this.page.goto(path);
  }

  async waitForLoad(): Promise<void> {
    // Option 3: Wait for specific content instead of network idle
    // Default to waiting for common page elements that indicate the page is ready
    await this.testUtils.waitForPageReady([
      { text: "Latest Videos" }, // Home page indicator
      { text: "Continue Watching" }, // Home page indicator
      "main", // Main content area
      '[data-testid="content"]', // Content area if available
      "header", // Header element
    ]);
  }

  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.testUtils.takeScreenshot(name);
  }

  async checkResponsiveLayout(): Promise<void> {
    // This method should be overridden by specific page classes
    // to check page-specific responsive elements
  }
}
