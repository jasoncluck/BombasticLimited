import { test, expect } from '@playwright/test';
import { MainPage } from '../pages/main-page';
import { waitForTextContent, waitForPageContent } from '../helpers/wait-for-content';
import { TestDataHelpers } from '../helpers/test-data-helpers';

/**
 * Example test demonstrating Option 3 approach
 * These tests show how to replace waitForLoadState with content-specific waiting
 */

test.describe('Main Page - Option 3 Approach', () => {
  test('should load main page with expected content', async ({ page }) => {
    const mainPage = new MainPage(page);
    
    // OLD APPROACH:
    // await page.goto('/');
    // await page.waitForLoadState('domcontentloaded');
    
    // NEW APPROACH - Option 3:
    // Navigate and wait for specific content that indicates the page is ready
    await mainPage.navigateToMain();
    
    // Verify the content is actually there
    await expect(page.getByText('Latest Videos')).toBeVisible();
  });

  test('should wait for latest videos section to load', async ({ page }) => {
    await page.goto('/');
    
    // OLD APPROACH:
    // await page.waitForLoadState('networkidle');
    // await page.waitForTimeout(2000); // Brittle timing-based wait
    
    // NEW APPROACH - Option 3:
    // Wait for specific content that indicates videos have loaded
    await waitForTextContent(page, 'Latest Videos');
    await waitForPageContent(page, {
      selectors: ['[data-testid="latest-videos-section"]', '.video-grid']
    });
    
    // Verify videos are actually present
    const videoCards = page.locator('.video-card');
    await expect(videoCards.first()).toBeVisible();
  });

  test('should handle navigation to video page', async ({ page }) => {
    const mainPage = new MainPage(page);
    
    await mainPage.navigateToMain();
    
    // OLD APPROACH:
    // await page.click('[data-testid="video-card"]:first-child');
    // await page.waitForLoadState('load');
    // await page.waitForTimeout(1000);
    
    // NEW APPROACH - Option 3:
    // Click video and wait for specific video page content
    await mainPage.clickFirstVideo();
    
    // Verify we're on the video page with actual content
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
    await expect(page.locator('[data-testid="video-title"]')).toBeVisible();
  });

  test('should wait for source sections to load', async ({ page }) => {
    const mainPage = new MainPage(page);
    
    await mainPage.navigateToMain();
    
    // OLD APPROACH:
    // await page.waitForLoadState('networkidle');
    // // Hope that all content has loaded
    
    // NEW APPROACH - Option 3:
    // Wait for specific source sections that we expect
    const expectedSources = ['Giant Bomb', 'Jeff Gerstmann', 'Nextlander'];
    await mainPage.waitForSourceSections(expectedSources);
    
    // Verify each source section is present
    for (const source of expectedSources) {
      await expect(page.getByText(source)).toBeVisible();
    }
  });

  test('should handle continue watching section based on auth state', async ({ page }) => {
    const mainPage = new MainPage(page);
    
    await mainPage.navigateToMain();
    
    // OLD APPROACH:
    // await page.waitForLoadState('domcontentloaded');
    // // Check if continue watching exists, but might miss it if slow to load
    
    // NEW APPROACH - Option 3:
    // Wait for main content first, then check for continue watching
    await mainPage.waitForLatestVideosSection();
    
    const hasContinueWatching = await mainPage.waitForContinueWatchingSection();
    
    if (hasContinueWatching) {
      await expect(page.getByText('Continue Watching')).toBeVisible();
      await expect(page.locator('[data-testid="continue-watching-videos"]')).toBeVisible();
    } else {
      await expect(page.getByText('Continue Watching')).not.toBeVisible();
    }
  });

  test('should handle playlist navigation', async ({ page }) => {
    const mainPage = new MainPage(page);
    
    await mainPage.navigateToMain();
    
    // OLD APPROACH:
    // await page.click('a[href="/playlists"]');
    // await page.waitForLoadState('networkidle');
    
    // NEW APPROACH - Option 3:
    // Navigate and wait for specific playlist content
    await mainPage.navigateToPlaylists();
    
    // Verify we're on the playlists page with actual content
    await expect(page.getByText('Playlist')).toBeVisible();
    await expect(page.locator('[data-testid="playlist-title"]')).toBeVisible();
  });

  test('should demonstrate error handling with content waiting', async ({ page }) => {
    // OLD APPROACH:
    // await page.goto('/non-existent-page');
    // await page.waitForLoadState('load'); // This would succeed even for 404 pages
    
    // NEW APPROACH - Option 3:
    // Try to navigate and wait for content, handle when content doesn't appear
    await page.goto('/non-existent-page');
    
    try {
      await waitForPageContent(page, TestDataHelpers.getMainPageContentIndicators(), { timeout: 5000 });
      // If we get here, something went wrong
      expect(false, 'Expected page not to load main content for non-existent page').toBe(true);
    } catch (error) {
      // Expected - the content we're waiting for shouldn't appear on a 404 page
      await expect(page.getByText('404')).toBeVisible();
    }
  });
});