import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should render main elements on desktop', async ({ page }) => {
    await page.goto('/');

    // Basic navigation and layout checks
    await expect(page.getByTestId('home-link')).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

    // Check for main content
    await expect(
      page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();

    // Check sidebar
    await expect(page.getByRole('complementary')).toBeVisible();
  });

  test('mobile viewport - home link should be hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Home link should be hidden on mobile (hidden sm:block classes)
    const homeLink = page.getByRole('link', { name: /home/i });
    await expect(homeLink).toBeHidden();
  });

  test('mobile viewport - toggle menu should be visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Toggle menu button should be visible on mobile
    const toggleButton = page.getByRole('button', { name: /toggle menu/i });
    await expect(toggleButton).toBeVisible();

    // The navigation should be present
    const navigation = page.getByRole('navigation');
    await expect(navigation).toBeVisible();
  });

  test('should display all live channels in sidebar', async ({ page }) => {
    await page.goto('/');

    // Check for all four live channels using more specific selectors
    await expect(
      page.getByRole('button', { name: /Live now Giant Bomb/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Live now The Jeff Gerstmann Show/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Live now Nextlander/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Live now Remap/ })
    ).toBeVisible();

    // Verify channel buttons are clickable
    const giantBombButton = page.getByRole('button', {
      name: /Live now Giant Bomb/,
    });
    await expect(giantBombButton).toBeVisible();

    const jeffButton = page.getByRole('button', {
      name: /Live now The Jeff Gerstmann Show/,
    });
    await expect(jeffButton).toBeVisible();

    const nextlanderButton = page.getByRole('button', {
      name: /Live now Nextlander/,
    });
    await expect(nextlanderButton).toBeVisible();

    const remapButton = page.getByRole('button', {
      name: /Live now Remap/,
    });
    await expect(remapButton).toBeVisible();
  });

  test('should display video carousels for each source', async ({ page }) => {
    await page.goto('/');

    // Check for source-specific carousel links
    await expect(page.getByRole('link', { name: 'Giant Bomb' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'The Jeff Gerstmann Show' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nextlander' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Remap' })).toBeVisible();

    // Verify carousel controls exist
    const nextSlideButtons = page.getByRole('button', { name: 'Next slide' });
    await expect(nextSlideButtons.first()).toBeVisible();

    // Check that video cards are present
    const videoCards = page.locator('[role="group"]');
    await expect(videoCards.first()).toBeVisible();
  });

  test('search functionality should navigate to search page', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get the search input
    const searchInput = page.getByRole('searchbox', { name: /search/i });
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('test search');
    await searchInput.press('Enter');

    // Should navigate to search page
    await expect(page).toHaveURL(/\/search\/test%20search/);

    // Should show search results
    const resultsHeading = page.getByRole('heading', { name: /results/i });
    await expect(resultsHeading).toBeVisible();
  });

  test('should navigate to individual video pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for video carousels to load and ensure we have buttons
    await page.waitForSelector('[role="group"] button', { timeout: 30000 });

    // Find the first clickable video button - be more specific to ensure it's found
    const videoButton = page.locator('[role="group"] button').first();
    await expect(videoButton).toBeVisible({ timeout: 15000 });

    // Click on first video button
    await videoButton.click();

    // Should navigate to video page
    await page.waitForURL(/\/video\//, { timeout: 10000 });

    // Video page should load with iframe player
    const videoFrame = page.locator('iframe');
    await expect(videoFrame).toBeVisible();
  });

  test('should navigate back from video page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to a video using carousel format (unauthenticated users)
    await page.waitForSelector('[role="group"]', { timeout: 30000 });
    const firstVideoCard = page.locator('[role="group"] button').first();
    await expect(firstVideoCard).toBeVisible();
    await firstVideoCard.click();
    await page.waitForURL(/\/video\//, { timeout: 10000 });

    // Click home link to return
    await page.getByTestId('home-link').click();

    // Should be back on homepage
    await page.waitForURL('/', { timeout: 10000 });
    await expect(
      page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });

  test('should handle carousel navigation', async ({ page }) => {
    await page.goto('/');

    // Test "Next slide" button functionality
    const nextSlideButton = page
      .getByRole('button', { name: 'Next slide' })
      .first();
    await expect(nextSlideButton).toBeVisible();

    // Click should not cause error (testing interaction)
    await nextSlideButton.click();

    // Page should remain stable
    await expect(
      page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });

  test('should display playlists section', async ({ page }) => {
    await page.goto('/');

    // Check for playlists heading
    await expect(
      page.getByRole('heading', { name: 'Playlists', level: 2 })
    ).toBeVisible();

    // Verify playlists section exists in sidebar
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Playlists')).toBeVisible();
  });

  test('should work across different viewport sizes', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 1024, height: 768 }, // Tablet landscape
      { width: 768, height: 1024 }, // Tablet portrait
      { width: 375, height: 667 }, // Mobile
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');

      // Core elements should be visible at all sizes
      // Home link is hidden on mobile, so check conditionally
      if (viewport.width >= 640) {
        // sm breakpoint
        await expect(page.getByTestId('home-link')).toBeVisible();
      }

      await expect(page.getByRole('searchbox')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Latest Videos' })
      ).toBeVisible();
      await expect(page.getByRole('complementary')).toBeVisible();
    }
  });

  test('should handle channel link navigation', async ({ page }) => {
    await page.goto('/');

    // Test Giant Bomb link
    const giantBombLink = page.getByRole('link', { name: 'Giant Bomb' });
    await expect(giantBombLink).toBeVisible();
    await expect(giantBombLink).toHaveAttribute('href', '/giantbomb/latest');

    // Test Jeff Gerstmann Show link
    const jeffLink = page.getByRole('link', {
      name: 'The Jeff Gerstmann Show',
    });
    await expect(jeffLink).toBeVisible();
    await expect(jeffLink).toHaveAttribute('href', '/jeffgerstmann/latest');

    // Test Nextlander link
    const nextlanderLink = page.getByRole('link', { name: 'Nextlander' });
    await expect(nextlanderLink).toBeVisible();
    await expect(nextlanderLink).toHaveAttribute('href', '/nextlander/latest');

    // Test Remap link
    const remapLink = page.getByRole('link', { name: 'Remap' });
    await expect(remapLink).toBeVisible();
    await expect(remapLink).toHaveAttribute('href', '/remap/latest');
  });

  test('should load video content dynamically', async ({ page }) => {
    await page.goto('/');

    // Wait for video cards to appear with timeout
    await page.waitForSelector('[role="group"]', { timeout: 15000 });

    // Verify multiple video cards are loaded
    const videoCards = page.locator('[role="group"]');
    const count = await videoCards.count();
    expect(count).toBeGreaterThan(5); // Should have multiple videos loaded

    // Verify video cards have proper structure
    const firstCard = videoCards.first();
    await expect(firstCard.locator('img')).toBeVisible(); // Thumbnail
    await expect(firstCard.locator('paragraph').first()).toBeVisible(); // Title
  });

  test('should handle empty search gracefully', async ({ page }) => {
    await page.goto('/');

    const searchBox = page.getByRole('searchbox');

    // Test empty search
    await searchBox.fill('');
    await searchBox.press('Enter');

    // Should handle gracefully (stay on page or redirect appropriately)
    // The exact behavior may vary, but should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display proper page metadata', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Bombastic/);

    // Verify page loads completely
    await page.waitForLoadState('networkidle');

    // Check that main content is loaded
    await expect(
      page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });

  test('should maintain layout integrity during interactions', async ({
    page,
  }) => {
    await page.goto('/');

    // Test search interaction doesn't break layout
    const searchBox = page.getByRole('searchbox');
    await searchBox.focus();
    await searchBox.fill('test query');

    // Layout should remain intact
    await expect(
      page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
    await expect(page.getByRole('complementary')).toBeVisible();

    // Clear search
    await searchBox.clear();

    // Layout should still be intact
    await expect(
      page.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });
});
