import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Test utilities for mobile and responsive testing
 */
export class TestUtils {
  constructor(private page: Page) {}

  /**
   * Check if page is in mobile viewport
   */
  async isMobileViewport(): Promise<boolean> {
    const viewport = this.page.viewportSize();
    return viewport ? viewport.width < 768 : false;
  }

  /**
   * Check if page is in tablet viewport
   */
  async isTabletViewport(): Promise<boolean> {
    const viewport = this.page.viewportSize();
    return viewport ? viewport.width >= 768 && viewport.width < 1024 : false;
  }

  /**
   * Check if page is in desktop viewport
   */
  async isDesktopViewport(): Promise<boolean> {
    const viewport = this.page.viewportSize();
    return viewport ? viewport.width >= 1024 : false;
  }

  /**
   * Simulate touch interaction
   */
  async touchTap(selector: string | Locator): Promise<void> {
    const locator =
      typeof selector === "string" ? this.page.locator(selector) : selector;
    await locator.tap();
  }

  /**
   * Simulate touch swipe
   */
  async touchSwipe(
    selector: string | Locator,
    direction: "left" | "right" | "up" | "down",
    distance: number = 100,
  ): Promise<void> {
    const locator =
      typeof selector === "string" ? this.page.locator(selector) : selector;
    const box = await locator.boundingBox();

    if (!box) {
      throw new Error("Element not found or not visible");
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    let endX = startX;
    let endY = startY;

    switch (direction) {
      case "left":
        endX = startX - distance;
        break;
      case "right":
        endX = startX + distance;
        break;
      case "up":
        endY = startY - distance;
        break;
      case "down":
        endY = startY + distance;
        break;
    }

    await this.page.touchscreen.tap(startX, startY);
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY);
    await this.page.mouse.up();
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(
    selector: string,
    timeout: number = 5000,
  ): Promise<Locator> {
    await this.page.waitForSelector(selector, { timeout });
    return this.page.locator(selector);
  }

  /**
   * Check responsive design elements
   */
  async checkResponsiveElement(
    selector: string,
    expectedStates: {
      mobile?: { visible?: boolean; text?: string; class?: string };
      tablet?: { visible?: boolean; text?: string; class?: string };
      desktop?: { visible?: boolean; text?: string; class?: string };
    },
  ): Promise<void> {
    const locator = this.page.locator(selector);

    if ((await this.isMobileViewport()) && expectedStates.mobile) {
      if (expectedStates.mobile.visible !== undefined) {
        await expect(locator).toBeVisible({
          visible: expectedStates.mobile.visible,
        });
      }
      if (expectedStates.mobile.text) {
        await expect(locator).toContainText(expectedStates.mobile.text);
      }
      if (expectedStates.mobile.class) {
        await expect(locator).toHaveClass(
          new RegExp(expectedStates.mobile.class),
        );
      }
    }

    if ((await this.isTabletViewport()) && expectedStates.tablet) {
      if (expectedStates.tablet.visible !== undefined) {
        await expect(locator).toBeVisible({
          visible: expectedStates.tablet.visible,
        });
      }
      if (expectedStates.tablet.text) {
        await expect(locator).toContainText(expectedStates.tablet.text);
      }
      if (expectedStates.tablet.class) {
        await expect(locator).toHaveClass(
          new RegExp(expectedStates.tablet.class),
        );
      }
    }

    if ((await this.isDesktopViewport()) && expectedStates.desktop) {
      if (expectedStates.desktop.visible !== undefined) {
        await expect(locator).toBeVisible({
          visible: expectedStates.desktop.visible,
        });
      }
      if (expectedStates.desktop.text) {
        await expect(locator).toContainText(expectedStates.desktop.text);
      }
      if (expectedStates.desktop.class) {
        await expect(locator).toHaveClass(
          new RegExp(expectedStates.desktop.class),
        );
      }
    }
  }

  /**
   * Take screenshot with device info in filename
   */
  async takeScreenshot(name: string): Promise<void> {
    const viewport = this.page.viewportSize();
    const deviceInfo = viewport
      ? `${viewport.width}x${viewport.height}`
      : "unknown";
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${deviceInfo}.png`,
      fullPage: true,
    });
  }

  /**
   * Check if element is clickable/tappable with better error handling
   */
  async isInteractive(selector: string | Locator): Promise<boolean> {
    const locator =
      typeof selector === "string" ? this.page.locator(selector) : selector;

    try {
      await expect(locator).toBeVisible({ timeout: 2000 });
      await expect(locator).toBeEnabled({ timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safe click/tap that checks if element is interactive first
   */
  async safeClick(selector: string | Locator): Promise<boolean> {
    if (await this.isInteractive(selector)) {
      const locator =
        typeof selector === "string" ? this.page.locator(selector) : selector;
      
      if (await this.isMobileViewport()) {
        await this.touchTap(locator);
      } else {
        await locator.click();
      }
      return true;
    }
    return false;
  }

  /**
   * Wait for any of multiple possible content states - simplified version
   */
  async waitForAnyContent(
    contentSelectors: (string | Locator | { text: string })[],
    options: { timeout?: number } = {},
  ): Promise<boolean> {
    const { timeout = 10000 } = options;
    
    // Try each selector sequentially with shorter timeouts
    const selectorTimeout = Math.floor(timeout / contentSelectors.length);
    
    for (const selector of contentSelectors) {
      try {
        if (typeof selector === "string") {
          await expect(this.page.locator(selector)).toBeVisible({ timeout: selectorTimeout });
          return true;
        } else if ("text" in selector) {
          await expect(this.page.getByText(selector.text).first()).toBeVisible({ timeout: selectorTimeout });
          return true;
        } else {
          await expect(selector).toBeVisible({ timeout: selectorTimeout });
          return true;
        }
      } catch {
        // Continue to next selector
      }
    }
    
    return false;
  }

  /**
   * Wait for specific content to appear - simplified version
   */
  async waitForContent(
    contentSelector: string | Locator | { text: string },
    options: {
      timeout?: number;
      state?: "visible" | "attached" | "detached" | "hidden";
    } = {},
  ): Promise<void> {
    const { timeout = 10000 } = options;

    if (typeof contentSelector === "string") {
      await expect(this.page.locator(contentSelector)).toBeVisible({ timeout });
    } else if ("text" in contentSelector) {
      await expect(this.page.getByText(contentSelector.text).first()).toBeVisible({ timeout });
    } else {
      await expect(contentSelector).toBeVisible({ timeout });
    }
  }

  /**
   * Wait for page to be ready - much simpler version
   */
  async waitForPageReady(
    contentIndicators: (string | Locator | { text: string })[],
    options: { timeout?: number } = {},
  ): Promise<void> {
    const { timeout = 15000 } = options;

    // Basic page readiness check
    await expect(this.page.locator("body")).toBeVisible({ timeout: 5000 });
    
    // Find at least one content indicator
    await this.waitForAnyContent(contentIndicators, { timeout: Math.max(5000, timeout - 5000) });
  }
}
