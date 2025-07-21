import { test, expect } from '@playwright/test';
import { VideoPage } from '../pages/video-page';
import { MainPage } from '../pages/main-page';
import { waitForSelector, waitForNavigationWithContent } from '../helpers/wait-for-content';
import { TestDataHelpers } from '../helpers/test-data-helpers';

/**
 * Video page tests demonstrating Option 3 approach
 * Shows how to replace waitForLoadState with video-specific content waiting
 */

test.describe('Video Page - Option 3 Approach', () => {
  test('should load video page with player and metadata', async ({ page }) => {
    const videoPage = new VideoPage(page);
    
    // OLD APPROACH:
    // await page.goto('/video/example-video-id');
    // await page.waitForLoadState('load');
    // await page.waitForTimeout(3000); // Wait for video to load
    
    // NEW APPROACH - Option 3:
    // Navigate and wait for specific video content
    await videoPage.navigateToVideo('example-video-id');
    
    // Verify video player and metadata are present
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
    await expect(page.locator('[data-testid="video-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="video-description"]')).toBeVisible();
  });

  test('should wait for video player to be fully loaded', async ({ page }) => {
    const videoPage = new VideoPage(page);
    
    await videoPage.navigateToVideo('example-video-id');
    
    // OLD APPROACH:
    // await page.waitForLoadState('networkidle');
    // // Hope that video player has loaded
    
    // NEW APPROACH - Option 3:
    // Wait for specific video player elements that indicate it's ready
    await videoPage.waitForVideoPlayer();
    
    // Verify player controls are available
    await expect(page.locator('[data-testid="video-controls"]')).toBeVisible();
    await expect(page.locator('[data-testid="play-button"]')).toBeVisible();
  });

  test('should handle video playback start', async ({ page }) => {
    const videoPage = new VideoPage(page);
    
    await videoPage.navigateToVideo('example-video-id');
    await videoPage.waitForVideoPlayer();
    
    // OLD APPROACH:
    // await page.click('[data-testid="play-button"]');
    // await page.waitForTimeout(2000); // Hope video starts playing
    
    // NEW APPROACH - Option 3:
    // Click play and wait for actual playback indicators
    await videoPage.playVideo();
    
    // Verify video is actually playing
    await expect(page.locator('[data-testid="video-playing"]')).toBeVisible();
    await expect(page.locator('[data-testid="pause-button"]')).toBeVisible();
  });

  test('should load related videos section', async ({ page }) => {
    const videoPage = new VideoPage(page);
    
    await videoPage.navigateToVideo('example-video-id');
    
    // OLD APPROACH:
    // await page.waitForLoadState('domcontentloaded');
    // // Assume related videos have loaded
    
    // NEW APPROACH - Option 3:
    // Wait for specific related videos content
    await videoPage.waitForRelatedVideos();
    
    // Verify related videos are present
    await expect(page.getByText('Related Videos')).toBeVisible();
    await expect(page.locator('[data-testid="related-videos"]')).toBeVisible();
    const relatedVideoCards = page.locator('[data-testid="related-video-card"]');
    await expect(relatedVideoCards.first()).toBeVisible();
  });

  test('should navigate from main page to video with content waiting', async ({ page }) => {
    const mainPage = new MainPage(page);
    
    await mainPage.navigateToMain();
    
    // OLD APPROACH:
    // await page.click('[data-testid="video-card"]:first-child');
    // await page.waitForURL(/.*\/video\/.*/);
    // await page.waitForLoadState('networkidle');
    
    // NEW APPROACH - Option 3:
    // Use navigation helper that waits for specific content
    await waitForNavigationWithContent(
      page,
      () => page.click('[data-testid="video-card"]:first-child'),
      TestDataHelpers.getVideoPageContentIndicators()
    );
    
    // Verify we have video page content
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
    await expect(page.url()).toMatch(/.*\/video\/.*/);
  });

  test('should handle slow-loading video content', async ({ page }) => {
    const videoPage = new VideoPage(page);
    
    // Simulate slow network
    await page.route('**/*', route => {
      setTimeout(() => route.continue(), 1000);
    });
    
    // OLD APPROACH:
    // await page.goto('/video/slow-video');
    // await page.waitForLoadState('load'); // Might succeed before video content loads
    // await page.waitForTimeout(5000); // Brittle wait
    
    // NEW APPROACH - Option 3:
    // Wait for actual video content with appropriate timeout
    await videoPage.navigateToVideo('slow-video', { timeout: 30000 });
    
    // Content-specific waits with proper timeouts
    await videoPage.waitForVideoMetadata({ timeout: 15000 });
    await videoPage.waitForVideoPlayer({ timeout: 20000 });
    
    // Verify everything loaded despite slow network
    await expect(page.locator('[data-testid="video-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
  });

  test('should handle video not found with proper error detection', async ({ page }) => {
    // OLD APPROACH:
    // await page.goto('/video/non-existent');
    // await page.waitForLoadState('load'); // Would succeed even for 404
    
    // NEW APPROACH - Option 3:
    // Try to load video content, handle when it doesn't appear
    await page.goto('/video/non-existent');
    
    try {
      await waitForSelector(page, '[data-testid="video-player"]', { timeout: 5000 });
      // If we get here, something went wrong
      expect(false, 'Expected video player not to load for non-existent video').toBe(true);
    } catch (error) {
      // Expected - video content shouldn't load for non-existent video
      // Instead, we should see error content
      await expect(page.getByText('Video not found')).toBeVisible();
    }
  });

  test('should demonstrate the difference in reliability', async ({ page }) => {
    const videoPage = new VideoPage(page);
    
    // This test shows why Option 3 is more reliable than waitForLoadState
    
    await page.goto('/video/example-video-id');
    
    // OLD APPROACH - could pass even if video content hasn't loaded:
    // await page.waitForLoadState('domcontentloaded');
    // console.log('Page loaded!'); // But maybe video player isn't ready
    
    // NEW APPROACH - ensures actual content is present:
    await videoPage.waitForVideoPlayer();
    await videoPage.waitForVideoMetadata();
    
    // Now we know for sure that:
    // 1. Video player is loaded and ready
    // 2. Video metadata (title, description) is available
    // 3. User can actually interact with the video
    
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
    await expect(page.locator('[data-testid="video-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="play-button"]')).toBeEnabled();
  });
});