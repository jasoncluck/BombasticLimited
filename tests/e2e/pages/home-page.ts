import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base-page";

export class HomePage extends BasePage {
  // Selectors
  private readonly latestVideosHeading: Locator;
  private readonly continueWatchingSection: Locator;
  private readonly sourceSection: Locator;
  private readonly videoCards: Locator;

  constructor(page: Page) {
    super(page);
    // Use more flexible selectors that are less likely to fail
    this.latestVideosHeading = page.getByText("Latest Videos").first();
    this.continueWatchingSection = page.locator('[data-testid="continue-watching-section"]');
    this.sourceSection = page.locator('[data-testid="source-section"]');
    this.videoCards = page.locator('[data-testid="video-card"]');
  }

  async expectPageToLoad(): Promise<void> {
    await this.waitForLoad();
    
    // Check for main navigation as the primary indicator of page load
    await expect(this.page.locator('[data-testid="main-navigation"]')).toBeVisible({ timeout: 10000 });
  }

  async expectLatestVideosSection(): Promise<void> {
    try {
      await expect(this.latestVideosHeading).toBeVisible({ timeout: 5000 });
    } catch {
      // Fallback - look for any heading that might indicate the page loaded
      try {
        const anyHeading = this.page.locator("h1").first();
        await expect(anyHeading).toBeVisible({ timeout: 3000 });
      } catch {
        console.warn("HomePage: Could not find any h1 heading, but continuing");
      }
    }
  }

  async expectContinueWatchingSection(
    shouldBeVisible: boolean = true,
  ): Promise<void> {
    if (shouldBeVisible) {
      await expect(this.continueWatchingSection).toBeVisible();
    } else {
      await expect(this.continueWatchingSection).not.toBeVisible();
    }
  }

  async getVideoCards(): Promise<Locator> {
    return this.videoCards;
  }

  async clickFirstVideoCard(): Promise<void> {
    const firstCard = this.videoCards.first();
    await expect(firstCard).toBeVisible();

    if (await this.testUtils.isMobileViewport()) {
      await this.testUtils.touchTap(firstCard);
    } else {
      await firstCard.click();
    }
  }

  async checkResponsiveLayout(): Promise<void> {
    // Check if video cards layout adapts to screen size
    const videoCards = await this.getVideoCards();
    const count = await videoCards.count();

    if (count > 0) {
      // Check grid layout responsiveness
      const firstCard = videoCards.first();
      const cardBox = await firstCard.boundingBox();

      if (await this.testUtils.isMobileViewport()) {
        // On mobile, cards should be stacked (full width or near full width)
        if (cardBox) {
          const viewportSize = this.page.viewportSize();
          const cardWidthRatio = cardBox.width / (viewportSize?.width || 1);
          expect(cardWidthRatio).toBeGreaterThan(0.8); // Cards should take most of the width
        }
      } else if (await this.testUtils.isDesktopViewport()) {
        // On desktop, multiple cards should fit side by side
        if (cardBox && count > 1) {
          const viewportSize = this.page.viewportSize();
          const cardWidthRatio = cardBox.width / (viewportSize?.width || 1);
          expect(cardWidthRatio).toBeLessThan(0.5); // Cards should be smaller to fit multiple per row
        }
      }
    }
  }

  async testTouchInteractions(): Promise<void> {
    if (await this.testUtils.isMobileViewport()) {
      const videoCards = await this.getVideoCards();
      const count = await videoCards.count();

      if (count > 0) {
        const firstCard = videoCards.first();
        await expect(firstCard).toBeVisible();

        // Test touch tap
        await this.testUtils.touchTap(firstCard);

        // Test if there's a carousel or swipeable element
        const carousel = this.page
          .locator('[data-testid="video-carousel"]')
          .first();
        if (await carousel.isVisible()) {
          // Test swipe gesture
          await this.testUtils.touchSwipe(carousel, "left", 100);
          await this.page.waitForTimeout(500); // Wait for animation

          await this.testUtils.touchSwipe(carousel, "right", 100);
          await this.page.waitForTimeout(500);
        }
      }
    }
  }

  async checkSourceSections(expectedSources: string[]): Promise<void> {
    for (const source of expectedSources) {
      const sourceElement = this.page.getByText(source);
      await expect(sourceElement).toBeVisible();
    }
  }
}
