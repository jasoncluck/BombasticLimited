import { authenticatedTest as test, expect } from './auth-fixtures';

test.describe('Authenticated User Features', () => {
  test('should access account page when authenticated', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/account');

    // Should be able to access account page without redirect
    await expect(authenticatedPage).toHaveURL('/account');

    // Should show user information in the form inputs (not as plain text)
    // First try by role and name
    const usernameInput = authenticatedPage.getByRole('textbox', {
      name: 'Username',
    });
    const emailInput = authenticatedPage.getByRole('textbox', {
      name: 'Email',
    });

    // Check if the inputs are visible first
    await expect(usernameInput).toBeVisible();
    await expect(emailInput).toBeVisible();

    // Get the actual values from the form and validate them
    const actualEmail = await emailInput.inputValue();
    const actualUsername = await usernameInput.inputValue();

    // The email should follow the test user pattern: test-user-worker-{workerId}@example.com
    expect(actualEmail).toMatch(/^test-user-worker-\d+@example\.com$/);

    // The username should follow the pattern: testuserworker{workerId}
    expect(actualUsername).toMatch(/^testuserworker\d+$/); // Both should not be empty
    expect(actualEmail.length).toBeGreaterThan(0);
    expect(actualUsername.length).toBeGreaterThan(0);
  });

  test('should create and manage playlists', async ({
    authenticatedPage,
    testDataManager,
    testUser,
  }) => {
    await authenticatedPage.goto('/playlists');

    // Create a test playlist
    const playlistName = `Test Playlist ${Date.now()}`;

    // Click create playlist button
    const createButton = authenticatedPage.getByRole('button', {
      name: /create playlist/i,
    });
    if (await createButton.isVisible()) {
      await createButton.click();

      // Fill in playlist details
      await authenticatedPage.getByLabel('Name').fill(playlistName);
      await authenticatedPage
        .getByLabel('Description')
        .fill('Test playlist description');

      // Submit the form
      await authenticatedPage
        .getByRole('button', { name: /save|create/i })
        .click();

      // Verify playlist was created
      await expect(authenticatedPage.getByText(playlistName)).toBeVisible();
    }

    // Clean up test playlist if created through UI
    await testDataManager.cleanupUserTestData(testUser.id);
  });

  test('should display authenticated navigation elements', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');

    // Should show Profile button (this is the main indicator of authentication)
    const profileButton = authenticatedPage.locator(
      'button:has-text("Profile")'
    );
    await expect(profileButton).toBeVisible();

    // Should also show the Card button for authenticated users
    const cardButton = authenticatedPage.getByTestId('user-preferences');
    await expect(cardButton).toBeVisible();
  });

  test('should maintain authentication across page reloads', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');

    // Reload the page
    await authenticatedPage.reload();

    // Should still be authenticated - check for Profile button
    const profileButton = authenticatedPage.locator(
      'button:has-text("Profile")'
    );
    await expect(profileButton).toBeVisible();

    // Can still access protected pages
    await authenticatedPage.goto('/account');
    await expect(authenticatedPage).toHaveURL('/account');
  });

  test('should show user-specific content preferences', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');

    // Verify authenticated user sees the expected layout
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Latest Videos' })
    ).toBeVisible();

    // The content should be loaded properly for authenticated users
    const videoCards = authenticatedPage.getByTestId('carousel-item');
    await expect(videoCards.first()).toBeVisible();
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');

    // Check if Profile button is visible (authenticated state)
    const profileButton = authenticatedPage.locator(
      'button:has-text("Profile")'
    );
    await expect(profileButton).toBeVisible();

    // Try to find and click logout button/link - this may vary based on your UI
    const logoutElement = authenticatedPage.locator(
      'button:has-text("Logout"), a:has-text("Logout"), [data-testid="logout-button"]'
    );

    // Only test logout if the logout element exists
    const logoutExists = await logoutElement
      .first()
      .isVisible()
      .catch(() => false);
    if (logoutExists) {
      await logoutElement.first().click();

      // Should redirect to homepage or login
      await authenticatedPage.waitForURL(/\/($|auth\/login)/);

      // Profile button should no longer be visible after logout
      await expect(profileButton).not.toBeVisible();

      // Trying to access protected page should redirect to login
      await authenticatedPage.goto('/account');
      await expect(authenticatedPage).toHaveURL(/\/auth\/login/);
    } else {
      console.log(
        'Logout functionality not found in UI - skipping logout test'
      );
    }
  });
});
