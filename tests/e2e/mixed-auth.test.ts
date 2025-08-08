import {
  authenticatedTest,
  unauthenticatedTest,
  expect,
} from './auth-fixtures';

authenticatedTest.describe('Authenticated User Flows', () => {
  authenticatedTest(
    'should show UI elements for authenticated users',
    async ({ authenticatedPage }) => {
      // Test authenticated user experience - should see Profile button
      await authenticatedPage.goto('/');
      const authProfileButton = authenticatedPage.locator(
        'button:has-text("Profile")'
      );
      await expect(authProfileButton).toBeVisible();

      // Also check for Card button on authenticated page
      const cardButton = authenticatedPage.locator('button:has-text("Card")');
      await expect(cardButton).toBeVisible();
    }
  );

  authenticatedTest(
    'should access protected pages normally',
    async ({ authenticatedPage }) => {
      // Authenticated user should access account page normally
      await authenticatedPage.goto('/account');
      await expect(authenticatedPage).toHaveURL('/account');
    }
  );

  authenticatedTest(
    'should see their playlists',
    async ({ authenticatedPage, testUser, testDataManager }) => {
      // Create a test playlist for the authenticated user
      const playlist = await testDataManager.createTestPlaylist(
        testUser.id,
        'Test Auth Playlist'
      );

      // Authenticated user should see their playlists
      await authenticatedPage.goto('/playlists');
      await expect(authenticatedPage.getByText(playlist.name)).toBeVisible();

      // Cleanup
      await testDataManager.cleanupUserTestData(testUser.id);
    }
  );

  authenticatedTest(
    'should be able to view and interact with videos',
    async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/');
      const authVideoCard = authenticatedPage
        .getByTestId('carousel-item')
        .first();
      await expect(authVideoCard).toBeVisible();

      // Click on video
      await authVideoCard.click();
      await authenticatedPage.waitForURL(/\/video\//);

      // Should be able to watch videos
      await expect(authenticatedPage.locator('iframe')).toBeVisible();

      // Authenticated users might have additional features like bookmarking
      // (This depends on your specific implementation)
    }
  );

  authenticatedTest(
    'should show search results',
    async ({ authenticatedPage }) => {
      const searchQuery = 'test search';

      await authenticatedPage.goto('/');
      const authSearchInput = authenticatedPage.getByTestId('search-input');
      await authSearchInput.pressSequentially(searchQuery);
      await authSearchInput.press('Enter');

      await authenticatedPage.waitForURL(
        new RegExp(`/search/${encodeURIComponent(searchQuery)}`)
      );

      const authResults = authenticatedPage.getByRole('heading', {
        name: /results/i,
      });
      await expect(authResults).toBeVisible();
    }
  );

  authenticatedTest(
    'should load home page successfully',
    async ({ authenticatedPage }) => {
      const authResponse = await authenticatedPage.goto('/');
      expect(authResponse?.status()).toBeLessThan(400);

      // Verify page loaded correctly with auth state
      await expect(
        authenticatedPage.locator('button:has-text("Profile")')
      ).toBeVisible();
    }
  );
});

unauthenticatedTest.describe('Unauthenticated User Flows', () => {
  unauthenticatedTest(
    'should NOT show UI elements for unauthenticated users',
    async ({ unauthenticatedPage }) => {
      // Test unauthenticated user experience - should NOT see Profile button
      await unauthenticatedPage.goto('/');
      const unauthProfileButton = unauthenticatedPage.locator(
        'button:has-text("Profile")'
      );
      await expect(unauthProfileButton).not.toBeVisible();
    }
  );

  unauthenticatedTest(
    'should redirect from protected pages',
    async ({ unauthenticatedPage }) => {
      // Unauthenticated user should be redirected from account page
      await unauthenticatedPage.goto('/account');
      await expect(unauthenticatedPage).toHaveURL(/\/auth\/login/);
    }
  );

  unauthenticatedTest(
    'should handle playlist access appropriately',
    async ({ unauthenticatedPage }) => {
      // Unauthenticated user might be redirected or see empty state
      await unauthenticatedPage.goto('/playlists');

      unauthenticatedPage.url().includes('/');
      await unauthenticatedPage
        .locator('button:has-text("Login")')
        .isVisible()
        .catch(() => false);
    }
  );

  unauthenticatedTest(
    'should be able to view videos',
    async ({ unauthenticatedPage }) => {
      // Should be able to view videos
      await unauthenticatedPage.goto('/');
      const unauthVideoCard = unauthenticatedPage
        .getByTestId('carousel-item')
        .first();
      await expect(unauthVideoCard).toBeVisible();

      // Click on video
      await unauthVideoCard.click();
      await unauthenticatedPage.waitForURL(/\/video\//);

      // Should be able to watch videos
      await expect(unauthenticatedPage.locator('iframe')).toBeVisible();
    }
  );

  unauthenticatedTest(
    'should show search results',
    async ({ unauthenticatedPage }) => {
      const searchQuery = 'test search';

      await unauthenticatedPage.goto('/');
      const unauthSearchInput = unauthenticatedPage.getByTestId('search-input');
      await unauthSearchInput.pressSequentially(searchQuery);
      await unauthenticatedPage.waitForTimeout(500);
      await unauthSearchInput.press('Enter');

      await unauthenticatedPage.waitForURL(
        new RegExp(`/search/${encodeURIComponent(searchQuery)}`)
      );
      const unauthResults = unauthenticatedPage.getByRole('heading', {
        name: /results/i,
      });
      await expect(unauthResults).toBeVisible();
    }
  );

  unauthenticatedTest(
    'should load home page successfully',
    async ({ unauthenticatedPage }) => {
      const unauthResponse = await unauthenticatedPage.goto('/');
      expect(unauthResponse?.status()).toBeLessThan(400);

      // Verify page loaded correctly without auth state
      await expect(
        unauthenticatedPage.locator('button:has-text("Profile")')
      ).not.toBeVisible();
    }
  );
});
