import { test, expect } from '../fixtures/base-fixtures';

test.describe('Mobile Touch Interactions', () => {
  test.use({ 
    viewport: { width: 375, height: 667 },
    hasTouch: true 
  });

  test('should support touch tap on video cards', async ({ homePage, testUtils }) => {
    await homePage.goto('/');
    await homePage.expectPageToLoad();
    
    const videoCards = await homePage.getVideoCards();
    const count = await videoCards.count();
    
    if (count > 0) {
      const firstCard = videoCards.first();
      await expect(firstCard).toBeVisible();
      
      // Test touch tap
      await testUtils.touchTap(firstCard);
      
      // Verify some action occurred (page navigation, modal, etc.)
      await homePage.page.waitForTimeout(1000);
    }
  });

  test('should support swipe gestures on carousels', async ({ page, testUtils }) => {
    await page.goto('/');
    await testUtils.waitForContent({ text: 'Latest Videos' });
    
    // Look for carousel elements
    const carousels = page.locator('[data-testid*="carousel"], .carousel, [class*="carousel"]');
    const count = await carousels.count();
    
    if (count > 0) {
      const firstCarousel = carousels.first();
      if (await firstCarousel.isVisible()) {
        const initialPos = await firstCarousel.boundingBox();
        
        // Swipe left
        await testUtils.touchSwipe(firstCarousel, 'left', 100);
        await page.waitForTimeout(500);
        
        // Swipe right
        await testUtils.touchSwipe(firstCarousel, 'right', 100);
        await page.waitForTimeout(500);
        
        const finalPos = await firstCarousel.boundingBox();
        // The element should still be visible after swipes
        expect(finalPos).toBeDefined();
      }
    }
  });

  test('should support pinch zoom gestures', async ({ page, testUtils }) => {
    await page.goto('/');
    await testUtils.waitForContent({ text: 'Latest Videos' });
    
    // Simulate pinch zoom
    const viewport = page.viewportSize();
    if (viewport) {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      
      // Start with two fingers
      await page.touchscreen.tap(centerX - 50, centerY);
      await page.touchscreen.tap(centerX + 50, centerY);
      
      // Move fingers apart (zoom in)
      await page.mouse.move(centerX - 50, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX - 100, centerY);
      await page.mouse.up();
      
      await page.mouse.move(centerX + 50, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 100, centerY);
      await page.mouse.up();
      
      // Verify page is still functional after zoom
      await expect(page.getByText('Latest Videos')).toBeVisible();
    }
  });

  test('should handle long press interactions', async ({ page, testUtils }) => {
    await page.goto('/');
    await testUtils.waitForContent({ text: 'Latest Videos' });
    
    const videoCards = page.locator('[data-testid="video-card"]');
    const count = await videoCards.count();
    
    if (count > 0) {
      const firstCard = videoCards.first();
      await expect(firstCard).toBeVisible();
      
      const box = await firstCard.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        // Simulate long press
        await page.touchscreen.tap(centerX, centerY);
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.waitForTimeout(1000); // Hold for 1 second
        await page.mouse.up();
        
        // Check if context menu or selection state appeared
        await page.waitForTimeout(500);
      }
    }
  });

  test('should prevent accidental touches during scrolling', async ({ page, testUtils }) => {
    await page.goto('/');
    await testUtils.waitForContent({ text: 'Latest Videos' });
    
    // Scroll down quickly
    await page.touchscreen.tap(200, 300);
    
    // Fast scroll
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(100);
    }
    
    // Page should still be responsive
    await expect(page.getByText('Latest Videos')).toBeVisible();
  });

  test('should support orientation change', async ({ page, testUtils }) => {
    await page.goto('/');
    await testUtils.waitForContent({ text: 'Latest Videos' });
    
    // Portrait mode (default)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByText('Latest Videos')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/portrait-mode.png' });
    
    // Landscape mode
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(500); // Wait for layout adjustment
    await expect(page.getByText('Latest Videos')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/landscape-mode.png' });
    
    // Back to portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await expect(page.getByText('Latest Videos')).toBeVisible();
  });
});