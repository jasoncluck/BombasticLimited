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
    // Simplified page loading - wait for essential elements
    await expect(this.page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(this.page.locator('[data-testid="main-navigation"]')).toBeVisible({ timeout: 10000 });
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
