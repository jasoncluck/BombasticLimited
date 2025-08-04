import { test, expect } from '@playwright/test';

test.describe('Homepage Rendering', () => {
  test('homepage loads and displays basic elements', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');

    // Check that the page loads with correct title
    await expect(page).toHaveTitle(/Bombastic/);

    // Verify the main navigation is present using more specific selector
    await expect(
      page.locator('nav, navigation, [role="navigation"]')
    ).toBeVisible();

    // Check for Home link in navigation (account for responsive design)
    const homeLink = page.locator('a[href="/"]').first();
    // The home link exists but might be hidden on mobile (responsive design)
    await expect(homeLink).toBeAttached();

    // Only check visibility if we're on a larger screen
    const currentViewport = page.viewportSize();
    if (currentViewport && currentViewport.width >= 640) {
      // Tailwind's sm breakpoint
      await expect(homeLink).toBeVisible();
      await expect(homeLink).toContainText('Home');
    }

    // Verify search functionality is present
    await expect(
      page.locator('input[placeholder*="Search"], [role="searchbox"]')
    ).toBeVisible();

    // Check login button is present
    await expect(
      page.locator('button').filter({ hasText: /login/i })
    ).toBeVisible();

    // Verify sidebar is rendered (check for responsive behavior)
    const sidebar = page.locator('[role="complementary"], aside');
    await expect(sidebar).toBeAttached();

    // Sidebar visibility depends on viewport size - check if we're on desktop
    const desktopViewport = page.viewportSize();
    if (desktopViewport && desktopViewport.width >= 768) {
      // On larger screens, sidebar should be visible
      await expect(sidebar).toBeVisible();
    }

    // Check main content area loads
    await expect(
      page.locator('h1').filter({ hasText: /latest videos/i })
    ).toBeVisible();
  });

  test('homepage renders correctly on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size

    // Navigate to the homepage
    await page.goto('/');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');

    // Check that the page loads with correct title
    await expect(page).toHaveTitle(/Bombastic/);

    // Verify the main navigation is present
    await expect(
      page.locator('nav, navigation, [role="navigation"]')
    ).toBeVisible();

    // On mobile, the Home link might be hidden, so just check navigation exists
    const navigation = page.locator('nav, navigation, [role="navigation"]');
    await expect(navigation).toBeVisible();

    // Verify search functionality is present
    await expect(
      page.locator('input[placeholder*="Search"], [role="searchbox"]')
    ).toBeVisible();

    // Check login button is present
    await expect(
      page.locator('button').filter({ hasText: /login/i })
    ).toBeVisible();

    // Verify sidebar exists (might be hidden on mobile)
    const sidebar = page.locator('[role="complementary"], aside');
    await expect(sidebar).toBeAttached();
    // On mobile, sidebar might be hidden, so we don't check visibility

    // Check main content area loads
    await expect(
      page.locator('h1').filter({ hasText: /latest videos/i })
    ).toBeVisible();
  });
});
