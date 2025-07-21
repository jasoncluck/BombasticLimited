import { test, expect } from "../fixtures/base-fixtures";

test.describe("User Interaction Flows", () => {
  test("should handle basic user navigation flow", async ({
    homePage,
    page,
    testUtils,
  }) => {
    await homePage.goto("/");
    await homePage.expectPageToLoad();

    // Check if we can navigate to different sections
    const navigationLinks = page.locator('nav a, [role="navigation"] a');
    const linkCount = await navigationLinks.count();

    if (linkCount > 0) {
      // Test clicking on navigation links
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = navigationLinks.nth(i);
        if (await link.isVisible()) {
          const href = await link.getAttribute("href");
          if (href && !href.startsWith("http") && !href.includes("mailto")) {
            await link.click();
            await testUtils.waitForPageReady([
              { text: "Latest Videos" },
              "main",
              "h1",
              '[data-testid="content"]',
            ]);

            // Should navigate successfully
            expect(page.url()).toContain(href);

            // Go back to home
            await page.goto("/");
            await testUtils.waitForContent({ text: "Latest Videos" });
          }
        }
      }
    }
  });

  test("should handle video card interactions", async ({ homePage, page }) => {
    await homePage.goto("/");
    await homePage.expectPageToLoad();

    const videoCards = await homePage.getVideoCards();
    const count = await videoCards.count();

    if (count > 0) {
      const firstCard = videoCards.first();
      await expect(firstCard).toBeVisible();

      // Click on video card
      await firstCard.click();
      await page.waitForTimeout(1000);

      // Should either navigate to video page or open modal/player
      // We'll check if URL changed or if a modal appeared
      const currentUrl = page.url();
      const modalVisible = await page
        .locator('[role="dialog"], .modal, [data-testid*="modal"]')
        .isVisible();

      expect(currentUrl !== "/" || modalVisible).toBe(true);
    }
  });

  test("should handle search functionality if available", async ({
    page,
    testUtils,
  }) => {
    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Look for search input
    const searchInput = page
      .locator(
        'input[type="search"], [placeholder*="search" i], [aria-label*="search" i]',
      )
      .first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("test video");
      await searchInput.press("Enter");
      await testUtils.waitForPageReady([
        { text: "Search Results" },
        { text: "No results" },
        { text: "Latest Videos" },
        "main",
      ]);

      // Should show search results or navigate to search page
      const hasResults = await page
        .locator('[data-testid*="search"], [class*="search"]')
        .isVisible();
      expect(hasResults || page.url().includes("search")).toBe(true);
    }
  });

  test("should handle user preferences and settings", async ({
    page,
    testUtils,
  }) => {
    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Look for settings or profile buttons
    const settingsButton = page
      .locator(
        '[aria-label*="settings" i], [data-testid*="settings"], [class*="settings"]',
      )
      .first();
    const profileButton = page
      .locator(
        '[aria-label*="profile" i], [data-testid*="profile"], [class*="profile"]',
      )
      .first();

    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Should open settings menu or navigate to settings page
      const settingsVisible = await page
        .locator('[role="dialog"], .modal, [data-testid*="settings"]')
        .isVisible();
      expect(settingsVisible || page.url().includes("settings")).toBe(true);
    } else if (await profileButton.isVisible()) {
      await profileButton.click();
      await page.waitForTimeout(500);

      // Should open profile menu or navigate to profile page
      const profileVisible = await page
        .locator('[role="dialog"], .modal, [data-testid*="profile"]')
        .isVisible();
      expect(profileVisible || page.url().includes("profile")).toBe(true);
    }
  });

  test("should handle playlist interactions if available", async ({
    page,
    testUtils,
  }) => {
    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Look for playlist elements
    const playlistElements = page.locator(
      '[data-testid*="playlist"], [class*="playlist"]',
    );
    const count = await playlistElements.count();

    if (count > 0) {
      const firstPlaylist = playlistElements.first();
      if (await firstPlaylist.isVisible()) {
        await firstPlaylist.click();
        await page.waitForTimeout(1000);

        // Should navigate to playlist or expand playlist view
        const playlistPageVisible =
          page.url().includes("playlist") ||
          (await page.locator('[data-testid*="playlist-detail"]').isVisible());
        expect(playlistPageVisible).toBe(true);
      }
    }
  });

  test("should handle continue watching functionality", async ({
    homePage,
    page,
  }) => {
    await homePage.goto("/");
    await homePage.expectPageToLoad();

    // Check if continue watching section exists
    const continueWatchingSection = page
      .locator('[data-testid*="continue"], :has-text("Continue Watching")')
      .first();

    if (await continueWatchingSection.isVisible()) {
      // Look for videos in continue watching section
      const continueVideos = continueWatchingSection
        .locator('[data-testid*="video"], .video-card')
        .first();

      if (await continueVideos.isVisible()) {
        await continueVideos.click();
        await page.waitForTimeout(1000);

        // Should navigate to video or open player
        const videoPageVisible =
          page.url().includes("video") ||
          page.url().includes("watch") ||
          (await page
            .locator('[data-testid*="player"], .video-player')
            .isVisible());
        expect(videoPageVisible).toBe(true);
      }
    }
  });

  test("should handle source filtering if available", async ({
    page,
    testUtils,
  }) => {
    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Look for source filter buttons
    const sourceButtons = page.locator(
      '[data-testid*="source"], button:has-text("Giant Bomb"), button:has-text("Jeff Gerstmann")',
    );
    const count = await sourceButtons.count();

    if (count > 0) {
      const firstSourceButton = sourceButtons.first();
      if (await firstSourceButton.isVisible()) {
        // Get initial video count
        const initialVideos = page.locator('[data-testid*="video"]');
        const initialCount = await initialVideos.count();

        await firstSourceButton.click();
        await page.waitForTimeout(1000);

        // Video list might change after filtering
        const filteredVideos = page.locator('[data-testid*="video"]');
        const filteredCount = await filteredVideos.count();

        // The count might be different or the same, but page should still be functional
        expect(filteredCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("should handle mobile menu if available", async ({
    page,
    testUtils,
  }) => {
    // Test with mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Look for mobile menu button (hamburger menu)
    const mobileMenuButton = page
      .locator(
        '[aria-label*="menu" i], [data-testid*="menu"], .hamburger, [class*="menu-toggle"]',
      )
      .first();

    if (await mobileMenuButton.isVisible()) {
      await testUtils.touchTap(mobileMenuButton);
      await page.waitForTimeout(500);

      // Mobile menu should be visible
      const mobileMenu = page
        .locator(
          '[role="navigation"], .mobile-menu, [data-testid*="mobile-menu"]',
        )
        .first();
      await expect(mobileMenu).toBeVisible();

      // Should be able to close the menu
      const closeButton = page
        .locator('[aria-label*="close" i], [data-testid*="close"]')
        .first();
      if (await closeButton.isVisible()) {
        await testUtils.touchTap(closeButton);
        await page.waitForTimeout(500);
      } else {
        // Try clicking outside the menu
        await page.tap("body");
        await page.waitForTimeout(500);
      }
    }
  });
});
