import {
  unauthenticatedTest as unauthTest,
  authenticatedTest as authTest,
  expect,
} from '../auth-fixtures';

unauthTest.describe('Unauthenticated content actions', () => {
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
    'should be able to click on a video in a playlist',
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
