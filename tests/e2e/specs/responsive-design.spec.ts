import { test, expect } from '../fixtures/base-fixtures';

test.describe('Responsive Design Testing', () => {
  test.describe('Mobile Layout', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test('should display mobile-optimized layout', async ({ homePage, testUtils }) => {
      await homePage.goto('/');
      await homePage.expectPageToLoad();
      
      expect(await testUtils.isMobileViewport()).toBe(true);
      await homePage.checkResponsiveLayout();
      await homePage.takeScreenshot('mobile-home-layout');
    });

    test('should handle touch interactions', async ({ homePage, testUtils }) => {
      await homePage.goto('/');
      await homePage.expectPageToLoad();
      
      expect(await testUtils.isMobileViewport()).toBe(true);
      await homePage.testTouchInteractions();
    });

    test('should have touch-friendly button sizes', async ({ page, testUtils }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Check if interactive elements meet minimum touch target size (44px recommended)
      const buttons = page.locator('button, a, [role="button"]');
      const count = await buttons.count();
      
      for (let i = 0; i < Math.min(count, 5); i++) {
        const button = buttons.nth(i);
        if (await button.isVisible() && await testUtils.isInteractive(button)) {
          const box = await button.boundingBox();
          if (box) {
            expect(box.height).toBeGreaterThanOrEqual(36); // Minimum touch target
            expect(box.width).toBeGreaterThanOrEqual(36);
          }
        }
      }
    });
  });

  test.describe('Tablet Layout', () => {
    test.use({ viewport: { width: 768, height: 1024 } }); // iPad

    test('should display tablet-optimized layout', async ({ homePage, testUtils }) => {
      await homePage.goto('/');
      await homePage.expectPageToLoad();
      
      expect(await testUtils.isTabletViewport()).toBe(true);
      await homePage.checkResponsiveLayout();
      await homePage.takeScreenshot('tablet-home-layout');
    });
  });

  test.describe('Desktop Layout', () => {
    test.use({ viewport: { width: 1920, height: 1080 } }); // Full HD

    test('should display desktop-optimized layout', async ({ homePage, testUtils }) => {
      await homePage.goto('/');
      await homePage.expectPageToLoad();
      
      expect(await testUtils.isDesktopViewport()).toBe(true);
      await homePage.checkResponsiveLayout();
      await homePage.takeScreenshot('desktop-home-layout');
    });

    test('should support hover interactions', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Find hoverable elements and test hover states
      const videoCards = page.locator('[data-testid="video-card"]');
      const count = await videoCards.count();
      
      if (count > 0) {
        const firstCard = videoCards.first();
        await expect(firstCard).toBeVisible();
        
        // Hover over the card and check for visual feedback
        await firstCard.hover();
        await page.waitForTimeout(200); // Wait for hover effects
        
        // Take screenshot to verify hover state
        await page.screenshot({ 
          path: 'test-results/screenshots/desktop-hover-state.png',
          fullPage: false
        });
      }
    });
  });

  test.describe('Cross-Viewport Consistency', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 }
    ];

    for (const viewport of viewports) {
      test(`should show consistent content on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        
        // Essential content should be visible on all viewports
        await expect(page.getByText('Latest Videos')).toBeVisible();
        
        // Take screenshot for comparison
        await page.screenshot({ 
          path: `test-results/screenshots/content-consistency-${viewport.name}.png`,
          fullPage: true
        });
      });
    }
  });
});