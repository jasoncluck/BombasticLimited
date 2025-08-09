import { unauthenticatedTest as test, expect } from './auth-fixtures';

test.describe('Homepage', () => {
  test('should render main elements on desktop', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    // Basic navigation and layout checks
    await expect(unauthenticatedPage.getByTestId('home-link')).toBeVisible();
    await expect(unauthenticatedPage.getByRole('searchbox')).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('button', { name: 'Login' })
    ).toBeVisible();

    // Check for main content
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();

    // Check sidebar
    await expect(unauthenticatedPage.getByRole('complementary')).toBeVisible();
  });

  test('mobile viewport - home link should be hidden', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.setViewportSize({ width: 375, height: 667 });
    await unauthenticatedPage.goto('/');
    await unauthenticatedPage.waitForLoadState('networkidle');

    // Home link should be hidden on mobile (hidden sm:block classes)
    const homeLink = unauthenticatedPage.getByRole('link', { name: /home/i });
    await expect(homeLink).toBeHidden();
  });

  test('mobile viewport - toggle menu should be visible', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.setViewportSize({ width: 375, height: 667 });
    await unauthenticatedPage.goto('/');
    await unauthenticatedPage.waitForLoadState('networkidle');

    // Toggle menu button should be visible on mobile
    const toggleButton = unauthenticatedPage.getByRole('button', {
      name: /toggle menu/i,
    });
    await expect(toggleButton).toBeVisible();

    // The navigation should be present
    const navigation = unauthenticatedPage.getByRole('navigation');
    await expect(navigation).toBeVisible();
  });

  test('should display all live channels in sidebar', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    // Check for all four live channels using more specific selectors
    await expect(
      unauthenticatedPage.getByRole('button', { name: /Live now Giant Bomb/ })
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('button', {
        name: /Live now The Jeff Gerstmann Show/,
      })
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('button', { name: /Live now Nextlander/ })
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('button', { name: /Live now Remap/ })
    ).toBeVisible();

    // Verify channel buttons are clickable
    const giantBombButton = unauthenticatedPage.getByRole('button', {
      name: /Live now Giant Bomb/,
    });
    await expect(giantBombButton).toBeVisible();

    const jeffButton = unauthenticatedPage.getByRole('button', {
      name: /Live now The Jeff Gerstmann Show/,
    });
    await expect(jeffButton).toBeVisible();

    const nextlanderButton = unauthenticatedPage.getByRole('button', {
      name: /Live now Nextlander/,
    });
    await expect(nextlanderButton).toBeVisible();

    const remapButton = unauthenticatedPage.getByRole('button', {
      name: /Live now Remap/,
    });
    await expect(remapButton).toBeVisible();
  });

  test('should display video carousels for each source', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    // Check for source-specific carousel links
    await expect(
      unauthenticatedPage.getByRole('link', { name: 'Giant Bomb' })
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('link', { name: 'The Jeff Gerstmann Show' })
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('link', { name: 'Nextlander' })
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('link', { name: 'Remap' })
    ).toBeVisible();

    // Verify carousel controls exist
    const nextSlideButtons = unauthenticatedPage.getByRole('button', {
      name: 'Next slide',
    });
    await expect(nextSlideButtons.first()).toBeVisible();

    // Check that video cards are present
    const videoCards = unauthenticatedPage.locator('[role="group"]');
    await expect(videoCards.first()).toBeVisible();
  });

  test('search functionality should navigate to search page', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');
    await unauthenticatedPage.waitForLoadState('networkidle');

    // Get the search input
    const searchInput = unauthenticatedPage.getByRole('searchbox', {
      name: /search/i,
    });
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('test search');
    await searchInput.press('Enter');

    // Should navigate to search page
    await expect(unauthenticatedPage).toHaveURL(/\/search\/test%20search/);

    // Should show search results
    const resultsHeading = unauthenticatedPage.getByRole('heading', {
      name: /results/i,
    });
    await expect(resultsHeading).toBeVisible();
  });

  test('should navigate to individual video pages', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');
    await unauthenticatedPage.waitForLoadState('networkidle');

    // Wait for video carousels to load and ensure we have buttons
    const carouselItem = unauthenticatedPage.getByTestId('carousel-item');
    await carouselItem.first().click();

    // Should navigate to video page
    await unauthenticatedPage.waitForURL(/\/video\//, { timeout: 10000 });

    // Video page should load with iframe player
    const videoFrame = unauthenticatedPage.locator('iframe');
    await expect(videoFrame).toBeVisible();
  });

  test('should navigate back from video page', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');
    await unauthenticatedPage.waitForLoadState('networkidle');

    // Navigate to a video using carousel format (unauthenticated users)
    const carouselItems = unauthenticatedPage.getByTestId('carousel-item');
    await expect(carouselItems.first()).toBeInViewport();
    await carouselItems.first().click();
    await unauthenticatedPage.waitForURL(/\/video\//, { timeout: 10000 });

    // Click home link to return
    await unauthenticatedPage.getByTestId('home-link').click();

    // Should be back on homepage
    await unauthenticatedPage.waitForURL('/', { timeout: 10000 });
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });

  test('should handle carousel navigation', async ({ unauthenticatedPage }) => {
    await unauthenticatedPage.goto('/');

    // Test "Next slide" button functionality
    const nextSlideButton = unauthenticatedPage
      .getByRole('button', { name: 'Next slide' })
      .first();
    await expect(nextSlideButton).toBeVisible();

    // Click should not cause error (testing interaction)
    await nextSlideButton.click();

    // Page should remain stable
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });

  test('should display playlists section', async ({ unauthenticatedPage }) => {
    await unauthenticatedPage.goto('/');

    // Check for playlists heading
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Playlists', level: 2 })
    ).toBeVisible();

    // Verify playlists section exists in sidebar
    const sidebar = unauthenticatedPage.getByRole('complementary');
    await expect(sidebar.getByText('Playlists')).toBeVisible();
  });

  test('should work across different viewport sizes', async ({
    unauthenticatedPage,
  }) => {
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 1024, height: 768 }, // Tablet landscape
      { width: 768, height: 1024 }, // Tablet portrait
      { width: 375, height: 667 }, // Mobile
    ];

    for (const viewport of viewports) {
      await unauthenticatedPage.setViewportSize(viewport);
      await unauthenticatedPage.goto('/');

      // Core elements should be visible at all sizes
      // Home link is hidden on mobile, so check conditionally
      if (viewport.width >= 640) {
        // sm breakpoint
        await expect(
          unauthenticatedPage.getByTestId('home-link')
        ).toBeVisible();
      }

      await expect(unauthenticatedPage.getByRole('searchbox')).toBeVisible();
      await expect(
        unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
      ).toBeVisible();

      if (viewport.width >= 640) {
        await expect(
          unauthenticatedPage.getByRole('complementary')
        ).toBeVisible();
      } else {
        await expect(
          unauthenticatedPage.getByRole('complementary')
        ).toBeHidden();
      }
    }
  });

  test('should handle channel link navigation', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    // Test Giant Bomb link
    const giantBombLink = unauthenticatedPage.getByRole('link', {
      name: 'Giant Bomb',
    });
    await expect(giantBombLink).toBeVisible();
    await expect(giantBombLink).toHaveAttribute('href', '/giantbomb/latest');

    // Test Jeff Gerstmann Show link
    const jeffLink = unauthenticatedPage.getByRole('link', {
      name: 'The Jeff Gerstmann Show',
    });
    await expect(jeffLink).toBeVisible();
    await expect(jeffLink).toHaveAttribute('href', '/jeffgerstmann/latest');

    // Test Nextlander link
    const nextlanderLink = unauthenticatedPage.getByRole('link', {
      name: 'Nextlander',
    });
    await expect(nextlanderLink).toBeVisible();
    await expect(nextlanderLink).toHaveAttribute('href', '/nextlander/latest');

    // Test Remap link
    const remapLink = unauthenticatedPage.getByRole('link', { name: 'Remap' });
    await expect(remapLink).toBeVisible();
    await expect(remapLink).toHaveAttribute('href', '/remap/latest');
  });

  test('should load video content dynamically', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    const carouselItems = unauthenticatedPage.getByTestId('carousel-item');
    await expect(carouselItems.first()).toBeInViewport();
    const count = await carouselItems.count();
    expect(count).toBeGreaterThan(5); // Should have multiple videos loaded

    // Verify video cards have proper structure
    const firstCard = carouselItems.first();
    await expect(firstCard.locator('img')).toBeVisible(); // Thumbnail
    await expect(firstCard.locator('p').first()).toBeVisible(); // Title
  });

  test('should handle empty search gracefully', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    const searchBox = unauthenticatedPage.getByRole('searchbox');

    // Test empty search
    await searchBox.fill('');
    await searchBox.press('Enter');

    // Should handle gracefully (stay on page or redirect appropriately)
    // The exact behavior may vary, but should not crash
    await expect(unauthenticatedPage.locator('body')).toBeVisible();
  });

  test('should display proper page metadata', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    // Check page title
    await expect(unauthenticatedPage).toHaveTitle(/Bombastic/);

    // Verify page loads completely
    await unauthenticatedPage.waitForLoadState('networkidle');

    // Check that main content is loaded
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });

  test('should maintain layout integrity during interactions', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/');

    // Test search interaction doesn't break layout
    const searchBox = unauthenticatedPage.getByRole('searchbox');
    await searchBox.focus();
    await searchBox.fill('test query');

    // Layout should remain intact
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
    await expect(unauthenticatedPage.getByRole('complementary')).toBeVisible();

    // Clear search
    await searchBox.clear();

    // Layout should still be intact
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();
  });
});
