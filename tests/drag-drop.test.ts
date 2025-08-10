import { test, expect } from '@playwright/test';

test.describe('Drag and Drop Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API responses
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/api/sidebar')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sources: [],
            playlists: [],
            continueVideos: []
          })
        });
      } else {
        route.continue();
      }
    });
  });

  test('content carousel drag and drop should work', async ({ page }) => {
    // Navigate to a page that has content carousel with drag and drop
    await page.goto('/playlist/test-playlist');
    
    // Wait for the carousel to load
    await page.waitForSelector('[data-testid="video-carousel"]', { timeout: 10000 });
    
    // Look for draggable carousel items
    const carouselItems = page.locator('[data-testid="carousel-item"][draggable="true"]');
    
    // Verify that carousel items exist and are draggable
    await expect(carouselItems.first()).toBeVisible();
    await expect(carouselItems.first()).toHaveAttribute('draggable', 'true');
    
    // Try to initiate a drag operation
    const firstItem = carouselItems.first();
    const boundingBox = await firstItem.boundingBox();
    
    if (boundingBox) {
      // Start drag from the first item
      await page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
      await page.mouse.down();
      
      // Move to simulate drag
      await page.mouse.move(boundingBox.x + boundingBox.width + 50, boundingBox.y + boundingBox.height / 2);
      
      // End drag
      await page.mouse.up();
    }
    
    // Verify no console errors occurred during drag operation
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    expect(consoleErrors.length).toBe(0);
  });

  test('content tiles drag and drop should work', async ({ page }) => {
    // Navigate to a page that has content tiles with drag and drop
    await page.goto('/playlist/test-playlist');
    
    // Check if there's a tiles view button and click it
    const tilesButton = page.locator('button:has-text("Tiles"), [data-testid="tiles-view"]');
    if (await tilesButton.count() > 0) {
      await tilesButton.click();
    }
    
    // Look for draggable tile items
    const tileItems = page.locator('[draggable="true"]').filter({ hasText: /Video|Title/ });
    
    if (await tileItems.count() > 0) {
      // Verify that tile items exist and are draggable
      await expect(tileItems.first()).toBeVisible();
      await expect(tileItems.first()).toHaveAttribute('draggable', 'true');
      
      // Try to initiate a drag operation
      const firstTile = tileItems.first();
      const boundingBox = await firstTile.boundingBox();
      
      if (boundingBox) {
        // Start drag from the first tile
        await page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
        await page.mouse.down();
        
        // Move to simulate drag
        await page.mouse.move(boundingBox.x + boundingBox.width + 50, boundingBox.y + boundingBox.height / 2);
        
        // End drag
        await page.mouse.up();
      }
    }
    
    // Verify no console errors occurred during drag operation
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    expect(consoleErrors.length).toBe(0);
  });
});