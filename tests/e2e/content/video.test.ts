import { unauthenticatedTest as unauthTest, expect } from '../auth-fixtures';
import { VideoHelpers } from '../helpers/video-helpers';
import { playlistTest } from '../playlist-fixtures';

unauthTest.describe('Unauthenticated video page actions', () => {
  unauthTest(
    'should be able to click on a video card and view the video',
    async ({ unauthenticatedPage: page }) => {
      await page.goto('/');

      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.click();

      await expect(page).toHaveURL(/\/video\/[a-zA-Z0-9_-]+$/);
    }
  );
  unauthTest(
    'should be able to click on a video in a source playlist',
    async ({ unauthenticatedPage: page }) => {
      await page.goto('/giantbomb');

      const highlightPlaylist = page
        .getByTestId('highlight-playlist-section')
        .first();

      const highlightPlaylistContentCard = highlightPlaylist
        .getByTestId('content-item')
        .first();

      await highlightPlaylistContentCard.waitFor();
      await highlightPlaylistContentCard.scrollIntoViewIfNeeded();
      await highlightPlaylistContentCard.click();

      await expect(page).toHaveURL(
        /\/playlist\/[a-zA-Z0-9_-]+\/video\/[a-zA-Z0-9_-]/
      );
    }
  );
});

playlistTest.describe('Authenticated video page actions', () => {
  let videoHelpers: VideoHelpers;

  playlistTest.beforeEach(async ({ authenticatedPage }) => {
    videoHelpers = new VideoHelpers(authenticatedPage);
    await videoHelpers.goToHomepage();
  });

  playlistTest(
    'Should be able to create a playlist and add the current video',
    async ({ playlistPage: page, playlistHelpers }) => {
      if ((await videoHelpers.getCurrentViewMode()) !== 'card') {
        videoHelpers.switchToCardView();
      }
      // Playlist is automatically created and will be cleaned up
      const playlistId = await playlistHelpers.createPlaylist();
      await playlistHelpers.verifyPlaylistExists(playlistId);

      await page.goto('/');
      // Add current video to the playlist
      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.click();

      // Wait for navigation to video page and extract video ID from URL
      const videoId: string =
        await playlistHelpers.extractVideoIdFromCurrentUrl();

      // Add video to playlist using the dropdown helper
      await playlistHelpers.addVideoToPlaylistViaDropdown(playlistId); // No video element needed on individual video page

      // Verify the video was added to the playlist
      await playlistHelpers.verifyVideoInPlaylist(playlistId, videoId);

      // Verify the playlist still exists
      await playlistHelpers.verifyPlaylistExists(playlistId);
    }
  );
});
