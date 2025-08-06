import { mixedTest as test, expect } from './auth-fixtures';

test.describe('Mixed Authentication Flows', () => {
  test('should show different UI for authenticated vs unauthenticated users', async ({
    authenticatedPage,
    unauthenticatedPage,
  }) => {
    // Test unauthenticated user experience - should NOT see Profile button
    await unauthenticatedPage.goto('/');
    const unauthProfileButton = unauthenticatedPage.locator(
      'button:has-text("Profile")'
    );
    await expect(unauthProfileButton).not.toBeVisible();

    // Test authenticated user experience - should see Profile button
    await authenticatedPage.goto('/');
    const authProfileButton = authenticatedPage.locator(
      'button:has-text("Profile")'
    );
    await expect(authProfileButton).toBeVisible();

    // Also check for Card button on authenticated page
    const cardButton = authenticatedPage.locator('button:has-text("Card")');
    await expect(cardButton).toBeVisible();
  });

  test('should redirect unauthenticated users from protected pages', async ({
    authenticatedPage,
    unauthenticatedPage,
  }) => {
    // Unauthenticated user should be redirected from account page
    await unauthenticatedPage.goto('/account');
    await expect(unauthenticatedPage).toHaveURL(/\/auth\/login/);

    // Authenticated user should access account page normally
    await authenticatedPage.goto('/account');
    await expect(authenticatedPage).toHaveURL('/account');
  });

  test('should handle playlist access differently for each user type', async ({
    authenticatedPage,
    unauthenticatedPage,
    testUser,
    testDataManager,
  }) => {
    // Create a test playlist for the authenticated user
    const playlist = await testDataManager.createTestPlaylist(
      testUser.id,
      'Test Mixed Auth Playlist'
    );

    // Authenticated user should see their playlists
    await authenticatedPage.goto('/playlists');
    await expect(authenticatedPage.getByText(playlist.name)).toBeVisible();

    // Unauthenticated user might be redirected or see empty state
    await unauthenticatedPage.goto('/playlists');
    // This behavior depends on your app - might redirect to login or show public playlists only
    const isOnLoginPage = unauthenticatedPage.url().includes('/auth/login');
    const hasProfileButton = await unauthenticatedPage
      .locator('button:has-text("Profile")')
      .isVisible()
      .catch(() => false);

    if (!isOnLoginPage && !hasProfileButton) {
      // If staying on playlists page without authentication, should not see the private playlist
      await expect(
        unauthenticatedPage.getByText(playlist.name)
      ).not.toBeVisible();
    }

    // Cleanup
    await testDataManager.cleanupUserTestData(testUser.id);
  });

  test('should handle video interactions differently for each user type', async ({
    authenticatedPage,
    unauthenticatedPage,
  }) => {
    // Both should be able to view videos
    await unauthenticatedPage.goto('/');
    const unauthVideoCard = unauthenticatedPage
      .getByTestId('carousel-item')
      .first();
    await expect(unauthVideoCard).toBeVisible();

    await authenticatedPage.goto('/');
    const authVideoCard = authenticatedPage
      .getByTestId('carousel-item')
      .first();
    await expect(authVideoCard).toBeVisible();

    // Click on video for both users
    await unauthVideoCard.click();
    await unauthenticatedPage.waitForURL(/\/video\//);

    await authVideoCard.click();
    await authenticatedPage.waitForURL(/\/video\//);

    // Both should be able to watch videos
    await expect(unauthenticatedPage.locator('iframe')).toBeVisible();
    await expect(authenticatedPage.locator('iframe')).toBeVisible();

    // But authenticated users might have additional features like bookmarking
    // (This depends on your specific implementation)
  });

  test('should show consistent search results for both user types', async ({
    authenticatedPage,
    unauthenticatedPage,
  }) => {
    const searchQuery = 'test search';

    // Search as unauthenticated user
    await unauthenticatedPage.goto('/');
    const unauthSearchInput = unauthenticatedPage.getByTestId('search-input');
    await unauthSearchInput.pressSequentially(searchQuery);
    // Wait for the search URL with the actual query parameter
    await unauthenticatedPage.waitForURL(
      new RegExp(`/search/${encodeURIComponent(searchQuery)}`)
    );

    const unauthResults = unauthenticatedPage.getByRole('heading', {
      name: /results/i,
    });
    await expect(unauthResults).toBeVisible();

    // Search as authenticated user
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

    // Both should show search results (though authenticated might have additional features)
    // The exact content will depend on your search implementation
  });

  test('should demonstrate parallel execution with different auth states', async ({
    authenticatedPage,
    unauthenticatedPage,
  }, workerInfo) => {
    // This test demonstrates that each worker has its own isolated auth state
    console.log(`Running parallel test in worker ${workerInfo.workerIndex}`);

    // Both contexts should work simultaneously without interference
    const [authResponse, unauthResponse] = await Promise.all([
      authenticatedPage.goto('/'),
      unauthenticatedPage.goto('/'),
    ]);

    expect(authResponse?.status()).toBeLessThan(400);
    expect(unauthResponse?.status()).toBeLessThan(400);

    // Verify both pages loaded correctly with their respective auth states
    await Promise.all([
      expect(
        authenticatedPage.locator('button:has-text("Profile")')
      ).toBeVisible(),
      expect(
        unauthenticatedPage.locator('button:has-text("Profile")')
      ).not.toBeVisible(),
    ]);
  });
});
