import { expect } from '@playwright/test';
import { authenticatedTest } from './auth-fixtures';
import { createPlaylistHelpers } from './playlist/playlist-helpers';
import { VideoHelpers } from './helpers/video-helpers';

/**
 * E2E tests for playlist watching behavior and timestamp integration
 *
 * These tests cover:
 * 1. Watching playlist videos and timestamp creation
 * 2. Continue watching integration with playlist context
 * 3. Resume playlist functionality with correct sort order
 * 4. Next videos display and ordering
 * 5. Playlist video navigation flows
 */

authenticatedTest.describe('Playlist Watching and Timestamp Integration', () => {
  let playlistHelpers: ReturnType<typeof createPlaylistHelpers>;
  let videoHelpers: VideoHelpers;

  authenticatedTest.beforeEach(async ({ authenticatedPage }) => {
    playlistHelpers = createPlaylistHelpers(authenticatedPage);
    videoHelpers = new VideoHelpers(authenticatedPage);
    await playlistHelpers.navigateToHomepage();
  });

  authenticatedTest.describe('Playlist Video Watching', () => {
    authenticatedTest('should create timestamp when watching playlist video', async ({ authenticatedPage }) => {
      // Create a playlist and add a video
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCard = await videoHelpers.getFirstVideoCard();
      const videoTitle = await videoHelpers.getVideoTitle(videoCard);
      
      await playlistHelpers.addVideoToPlaylist(videoCard, playlistName);
      
      // Navigate to playlist and click on video
      await playlistHelpers.navigateToPlaylist(playlistName);
      const playlistVideos = await playlistHelpers.getPlaylistVideos();
      
      if (playlistVideos.length > 0) {
        // Simulate watching the video by navigating to it
        await videoHelpers.navigateToVideo(playlistVideos[0]);
        
        // Wait for iframe to load (simulating some watch time)
        await authenticatedPage.waitForTimeout(2000);
        
        // Navigate back to homepage to check continue watching
        await playlistHelpers.navigateToHomepage();
        
        // Check if video appears in continue watching
        const continueWatchingSection = await playlistHelpers.getContinueWatchingSection();
        if (continueWatchingSection) {
          const continueVideos = await videoHelpers.getContinueWatchingVideos();
          
          // Verify our video is in continue watching
          let foundVideo = false;
          for (const video of continueVideos) {
            const title = await videoHelpers.getVideoTitle(video);
            if (title === videoTitle) {
              foundVideo = true;
              break;
            }
          }
          expect(foundVideo).toBe(true);
        }
      }
      
      // Cleanup
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should resume playlist with correct sort order when clicking continue watching card', async ({ authenticatedPage }) => {
      // Create a playlist with multiple videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 2) {
        // Add multiple videos
        for (let i = 0; i < Math.min(3, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
        
        // Navigate to playlist and set specific sort order
        await playlistHelpers.navigateToPlaylist(playlistName);
        await playlistHelpers.changePlaylistSortOrder('Title', 'ascending');
        
        // Watch first video
        const playlistVideos = await playlistHelpers.getPlaylistVideos();
        if (playlistVideos.length > 0) {
          const firstVideoTitle = await videoHelpers.getVideoTitle(playlistVideos[0]);
          await videoHelpers.navigateToVideo(playlistVideos[0]);
          
          // Wait for some watch time
          await authenticatedPage.waitForTimeout(2000);
          
          // Navigate to homepage
          await playlistHelpers.navigateToHomepage();
          
          // Find and click continue watching card
          const continueWatchingSection = await playlistHelpers.getContinueWatchingSection();
          if (continueWatchingSection) {
            const continueVideos = await videoHelpers.getContinueWatchingVideos();
            
            for (const video of continueVideos) {
              const title = await videoHelpers.getVideoTitle(video);
              if (title === firstVideoTitle) {
                await playlistHelpers.resumePlaylistFromContinueWatching(video);
                break;
              }
            }
            
            // Verify we're in playlist video page with correct sort order
            expect(authenticatedPage.url()).toMatch(/\/playlist\/.*\/video\//);
            
            const currentSort = await playlistHelpers.getCurrentSortOrder();
            expect(currentSort.key).toBe('title');
            expect(currentSort.order).toBe('ascending');
          }
        }
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should navigate to playlist page when clicking playlist title in continue watching', async ({ authenticatedPage }) => {
      // Create a playlist and add a video
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCard = await videoHelpers.getFirstVideoCard();
      const videoTitle = await videoHelpers.getVideoTitle(videoCard);
      
      await playlistHelpers.addVideoToPlaylist(videoCard, playlistName);
      
      // Navigate to playlist and set sort order
      await playlistHelpers.navigateToPlaylist(playlistName);
      await playlistHelpers.changePlaylistSortOrder('Published At', 'descending');
      
      // Watch the video
      const playlistVideos = await playlistHelpers.getPlaylistVideos();
      if (playlistVideos.length > 0) {
        await videoHelpers.navigateToVideo(playlistVideos[0]);
        await authenticatedPage.waitForTimeout(2000);
        
        // Navigate to homepage
        await playlistHelpers.navigateToHomepage();
        
        // Find continue watching video and click playlist title
        const continueWatchingSection = await playlistHelpers.getContinueWatchingSection();
        if (continueWatchingSection) {
          const continueVideos = await videoHelpers.getContinueWatchingVideos();
          
          for (const video of continueVideos) {
            const title = await videoHelpers.getVideoTitle(video);
            if (title === videoTitle) {
              await playlistHelpers.clickPlaylistTitleInCard(video);
              break;
            }
          }
          
          // Verify we're on playlist page with correct sort order
          expect(authenticatedPage.url()).toMatch(/\/playlist\//);
          
          const currentSort = await playlistHelpers.getCurrentSortOrder();
          expect(currentSort.key).toBe('datePublished');
          expect(currentSort.order).toBe('descending');
        }
      }
      
      // Cleanup
      await playlistHelpers.deletePlaylist();
    });
  });

  authenticatedTest.describe('Next Videos Display and Ordering', () => {
    authenticatedTest('should display next videos in correct sort order when watching playlist video', async ({ authenticatedPage }) => {
      // Create a playlist with multiple videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 3) {
        // Add multiple videos
        for (let i = 0; i < Math.min(4, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
        
        // Navigate to playlist and set sort order
        await playlistHelpers.navigateToPlaylist(playlistName);
        await playlistHelpers.changePlaylistSortOrder('Title', 'ascending');
        
        // Navigate to first video
        const playlistVideos = await playlistHelpers.getPlaylistVideos();
        if (playlistVideos.length > 0) {
          await videoHelpers.navigateToVideo(playlistVideos[0]);
          
          // Check for next videos section
          const nextVideosSection = await playlistHelpers.getNextVideosSection();
          if (nextVideosSection) {
            await expect(nextVideosSection).toBeVisible();
            
            // Verify sort order is maintained in URL if not default
            const currentSort = await playlistHelpers.getCurrentSortOrder();
            if (currentSort.key !== 'playlistOrder' || currentSort.order !== 'ascending') {
              expect(authenticatedPage.url()).toMatch(/title=ascending/);
            }
          }
        }
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should include query parameters when playlist sort order is not default', async ({ authenticatedPage }) => {
      // Create a playlist with videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 2) {
        // Add videos
        for (let i = 0; i < Math.min(3, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
        
        // Navigate to playlist and set non-default sort order
        await playlistHelpers.navigateToPlaylist(playlistName);
        await playlistHelpers.changePlaylistSortOrder('Published At', 'ascending');
        
        // Navigate to first video
        const playlistVideos = await playlistHelpers.getPlaylistVideos();
        if (playlistVideos.length > 0) {
          await videoHelpers.navigateToVideo(playlistVideos[0]);
          
          // Verify URL contains sort parameters
          expect(authenticatedPage.url()).toMatch(/datePublished=ascending/);
        }
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should not include query parameters when using default sort order', async ({ authenticatedPage }) => {
      // Create a playlist with videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 2) {
        // Add videos
        for (let i = 0; i < Math.min(2, videoCards.length); i++) {
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
        
        // Navigate to playlist (Custom/playlistOrder ascending is default)
        await playlistHelpers.navigateToPlaylist(playlistName);
        
        // Navigate to first video
        const playlistVideos = await playlistHelpers.getPlaylistVideos();
        if (playlistVideos.length > 0) {
          await videoHelpers.navigateToVideo(playlistVideos[0]);
          
          // Verify URL does not contain sort parameters for default
          expect(authenticatedPage.url()).not.toMatch(/playlistOrder/);
          expect(authenticatedPage.url()).not.toMatch(/ascending/);
        }
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
    });
  });

  authenticatedTest.describe('Playlist Context in Continue Watching', () => {
    authenticatedTest('should maintain playlist context when resuming from continue watching', async ({ authenticatedPage }) => {
      // Create two playlists with same video to test context preservation
      const playlist1Name = await playlistHelpers.createPlaylist();
      const playlist2Name = await playlistHelpers.createPlaylist();
      
      const videoCard = await videoHelpers.getFirstVideoCard();
      const videoTitle = await videoHelpers.getVideoTitle(videoCard);
      
      // Add same video to both playlists
      await playlistHelpers.addVideoToPlaylist(videoCard, playlist1Name);
      await playlistHelpers.addVideoToPlaylist(videoCard, playlist2Name);
      
      // Watch video from first playlist with specific sort order
      await playlistHelpers.navigateToPlaylist(playlist1Name);
      await playlistHelpers.changePlaylistSortOrder('Title', 'descending');
      
      const playlistVideos = await playlistHelpers.getPlaylistVideos();
      if (playlistVideos.length > 0) {
        await videoHelpers.navigateToVideo(playlistVideos[0]);
        await authenticatedPage.waitForTimeout(2000);
        
        // Navigate to homepage and resume
        await playlistHelpers.navigateToHomepage();
        
        const continueWatchingSection = await playlistHelpers.getContinueWatchingSection();
        if (continueWatchingSection) {
          const continueVideos = await videoHelpers.getContinueWatchingVideos();
          
          for (const video of continueVideos) {
            const title = await videoHelpers.getVideoTitle(video);
            if (title === videoTitle) {
              await playlistHelpers.resumePlaylistFromContinueWatching(video);
              break;
            }
          }
          
          // Verify we're in the correct playlist context
          expect(authenticatedPage.url()).toContain(playlist1Name);
          
          const currentSort = await playlistHelpers.getCurrentSortOrder();
          expect(currentSort.key).toBe('title');
          expect(currentSort.order).toBe('descending');
        }
      }
      
      // Cleanup
      await playlistHelpers.navigateToHomepage();
      await playlistHelpers.deletePlaylist();
      await playlistHelpers.deletePlaylist();
    });

    authenticatedTest('should handle multiple videos from same playlist in continue watching', async ({ authenticatedPage }) => {
      // Create a playlist with multiple videos
      const playlistName = await playlistHelpers.createPlaylist();
      const videoCards = await videoHelpers.getVideoCards();
      
      if (videoCards.length >= 3) {
        const videoTitles = [];
        
        // Add multiple videos and watch them
        for (let i = 0; i < Math.min(3, videoCards.length); i++) {
          const title = await videoHelpers.getVideoTitle(videoCards[i]);
          videoTitles.push(title);
          await playlistHelpers.addVideoToPlaylist(videoCards[i], playlistName);
        }
        
        // Navigate to playlist and watch videos
        await playlistHelpers.navigateToPlaylist(playlistName);
        const playlistVideos = await playlistHelpers.getPlaylistVideos();
        
        // Watch multiple videos briefly
        for (let i = 0; i < Math.min(2, playlistVideos.length); i++) {
          await videoHelpers.navigateToVideo(playlistVideos[i]);
          await authenticatedPage.waitForTimeout(1500);
          await authenticatedPage.goBack();
        }
        
        // Check continue watching
        await playlistHelpers.navigateToHomepage();
        const continueWatchingSection = await playlistHelpers.getContinueWatchingSection();
        
        if (continueWatchingSection) {
          const continueVideos = await videoHelpers.getContinueWatchingVideos();
          
          // Should have multiple videos from the same playlist
          let playlistVideoCount = 0;
          for (const video of continueVideos) {
            const title = await videoHelpers.getVideoTitle(video);
            if (videoTitles.includes(title || '')) {
              playlistVideoCount++;
            }
          }
          
          expect(playlistVideoCount).toBeGreaterThan(1);
        }
      }
      
      // Cleanup
      await playlistHelpers.deletePlaylist();
    });
  });
});