import { test, expect } from '@playwright/test';
import { 
  waitForTextContent, 
  waitForSelector, 
  waitForNavigationWithContent 
} from '../helpers/wait-for-content';

/**
 * Migration examples showing before/after code
 * This file demonstrates exactly how to convert from waitForLoadState to Option 3
 */

test.describe('Migration Examples - Before and After', () => {
  
  test('Example 1: Basic page load', async ({ page }) => {
    // ❌ OLD APPROACH using waitForLoadState
    /*
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Page might be "loaded" but content isn't ready
    */
    
    // ✅ NEW APPROACH using Option 3 - wait for specific content
    await page.goto('/');
    await waitForTextContent(page, 'Latest Videos');
    await waitForSelector(page, '[data-testid="latest-videos-section"]');
    
    // Now we know the actual content is present
    await expect(page.getByText('Latest Videos')).toBeVisible();
  });

  test('Example 2: Navigation with content waiting', async ({ page }) => {
    await page.goto('/');
    await waitForTextContent(page, 'Latest Videos');
    
    // ❌ OLD APPROACH
    /*
    await page.click('a[href="/playlists"]');
    await page.waitForLoadState('networkidle');
    // Network might be idle but content still loading
    */
    
    // ✅ NEW APPROACH using Option 3
    await waitForNavigationWithContent(
      page,
      () => page.click('a[href="/playlists"]'),
      {
        text: ['Playlist'],
        selectors: ['[data-testid="playlist-title"]']
      }
    );
    
    // Verify we have the expected playlist content
    await expect(page.getByText('Playlist')).toBeVisible();
  });

  test('Example 3: Form interaction', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // ❌ OLD APPROACH
    /*
    await page.waitForLoadState('load');
    await page.fill('input[type="email"]', 'test@example.com');
    // Form might not be ready for interaction
    */
    
    // ✅ NEW APPROACH using Option 3
    await waitForSelector(page, 'input[type="email"]:not([disabled])');
    await waitForSelector(page, 'button[type="submit"]:not([disabled])');
    
    // Now we know the form is ready for interaction
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    // Wait for the next page content after form submission
    await waitForNavigationWithContent(
      page,
      () => page.click('button[type="submit"]'),
      {
        text: ['Welcome'],
        selectors: ['[data-testid="dashboard"]']
      }
    );
  });

  test('Example 4: Video player interaction', async ({ page }) => {
    await page.goto('/video/example-id');
    
    // ❌ OLD APPROACH
    /*
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Brittle timing
    await page.click('[data-testid="play-button"]');
    */
    
    // ✅ NEW APPROACH using Option 3
    await waitForSelector(page, '[data-testid="video-player"]');
    await waitForSelector(page, '[data-testid="video-controls"]');
    await waitForSelector(page, '[data-testid="play-button"]:not([disabled])');
    
    // Now we know the video player is fully loaded and ready
    await page.click('[data-testid="play-button"]');
    
    // Wait for video to actually start playing
    await waitForSelector(page, '[data-testid="video-playing"]');
    await expect(page.locator('[data-testid="pause-button"]')).toBeVisible();
  });

  test('Example 5: Dynamic content loading', async ({ page }) => {
    await page.goto('/');
    
    // ❌ OLD APPROACH
    /*
    await page.waitForLoadState('domcontentloaded');
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000); // Hope content has loaded
    */
    
    // ✅ NEW APPROACH using Option 3
    await waitForTextContent(page, 'Latest Videos');
    
    // Scroll to trigger lazy loading and wait for specific content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForSelector(page, '[data-testid="lazy-loaded-content"]');
    await waitForTextContent(page, 'More Videos');
    
    // Verify the lazy-loaded content is actually present
    await expect(page.locator('[data-testid="lazy-loaded-content"]')).toBeVisible();
  });

  test('Example 6: Error handling and timeouts', async ({ page }) => {
    // ❌ OLD APPROACH
    /*
    await page.goto('/slow-page');
    await page.waitForLoadState('load'); // Might timeout or succeed prematurely
    */
    
    // ✅ NEW APPROACH using Option 3
    await page.goto('/slow-page');
    
    try {
      await waitForTextContent(page, 'Page Content', { timeout: 15000 });
      await waitForSelector(page, '[data-testid="main-content"]', { timeout: 15000 });
      
      // Content loaded successfully
      await expect(page.getByText('Page Content')).toBeVisible();
    } catch (error) {
      // Handle timeout with meaningful error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('Content failed to load within timeout:', errorMessage);
      
      // Check if we got an error page instead
      const hasErrorMessage = await page.getByText('Error loading content').isVisible({ timeout: 1000 });
      if (hasErrorMessage) {
        console.log('Page showed error message as expected');
      }
    }
  });

  test('Example 7: Multiple content sections', async ({ page }) => {
    await page.goto('/');
    
    // ❌ OLD APPROACH
    /*
    await page.waitForLoadState('networkidle');
    // Hope all sections have loaded
    */
    
    // ✅ NEW APPROACH using Option 3
    // Wait for all the different sections we expect on the main page
    await Promise.all([
      waitForTextContent(page, 'Latest Videos'),
      waitForTextContent(page, 'Giant Bomb'),
      waitForTextContent(page, 'Jeff Gerstmann'),
      waitForSelector(page, '[data-testid="navigation-menu"]'),
      waitForSelector(page, '[data-testid="user-controls"]')
    ]);
    
    // Now we know all sections are loaded
    await expect(page.getByText('Latest Videos')).toBeVisible();
    await expect(page.getByText('Giant Bomb')).toBeVisible();
    await expect(page.getByText('Jeff Gerstmann')).toBeVisible();
  });

  test('Example 8: Conditional content based on auth state', async ({ page }) => {
    await page.goto('/');
    
    // ❌ OLD APPROACH
    /*
    await page.waitForLoadState('domcontentloaded');
    // Check for continue watching, but might miss it if slow to load
    const continueWatching = await page.locator('[data-testid="continue-watching"]').isVisible();
    */
    
    // ✅ NEW APPROACH using Option 3
    // First wait for the main content to load
    await waitForTextContent(page, 'Latest Videos');
    
    // Then check for auth-specific content with appropriate timeout
    try {
      await waitForTextContent(page, 'Continue Watching', { timeout: 5000 });
      
      // User is logged in, wait for continue watching content
      await waitForSelector(page, '[data-testid="continue-watching-videos"]');
      await expect(page.getByText('Continue Watching')).toBeVisible();
      
    } catch {
      // User is not logged in, should see sign in prompt
      await waitForTextContent(page, 'Sign In');
      await expect(page.getByText('Sign In')).toBeVisible();
    }
  });
});