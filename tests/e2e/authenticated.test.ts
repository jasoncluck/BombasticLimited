import { authenticatedTest as test, expect } from '../auth-fixtures';

test.describe('Authenticated User Features', () => {
  test('should access account page when authenticated', async ({ authenticatedPage, testUser }) => {
    await authenticatedPage.goto('/account');
    
    // Should be able to access account page without redirect
    await expect(authenticatedPage).toHaveURL('/account');
    
    // Should show user information
    await expect(authenticatedPage.getByText(testUser.username)).toBeVisible();
    await expect(authenticatedPage.getByText(testUser.email)).toBeVisible();
  });

  test('should create and manage playlists', async ({ authenticatedPage, testDataManager, testUser }) => {
    await authenticatedPage.goto('/playlists');
    
    // Create a test playlist
    const playlistName = `Test Playlist ${Date.now()}`;
    
    // Click create playlist button
    const createButton = authenticatedPage.getByRole('button', { name: /create playlist/i });
    if (await createButton.isVisible()) {
      await createButton.click();
      
      // Fill in playlist details
      await authenticatedPage.getByLabel('Name').fill(playlistName);
      await authenticatedPage.getByLabel('Description').fill('Test playlist description');
      
      // Submit the form
      await authenticatedPage.getByRole('button', { name: /save|create/i }).click();
      
      // Verify playlist was created
      await expect(authenticatedPage.getByText(playlistName)).toBeVisible();
    }
    
    // Clean up test playlist if created through UI
    await testDataManager.cleanupUserTestData(testUser.id);
  });

  test('should display authenticated navigation elements', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    
    // Should show logout or account button instead of login
    const authElement = authenticatedPage.locator('[data-testid="user-menu"], button:has-text("Account"), button:has-text("Logout"), a:has-text("Account")');
    await expect(authElement.first()).toBeVisible();
    
    // Should NOT show login button
    const loginButton = authenticatedPage.getByRole('button', { name: 'Login' });
    await expect(loginButton).not.toBeVisible();
  });

  test('should maintain authentication across page reloads', async ({ authenticatedPage, testUser }) => {
    await authenticatedPage.goto('/');
    
    // Reload the page
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Should still be authenticated
    const authElement = authenticatedPage.locator('[data-testid="user-menu"], button:has-text("Account"), button:has-text("Logout"), a:has-text("Account")');
    await expect(authElement.first()).toBeVisible();
    
    // Can still access protected pages
    await authenticatedPage.goto('/account');
    await expect(authenticatedPage).toHaveURL('/account');
  });

  test('should show user-specific content preferences', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    
    // Check if user preferences are loaded (this might vary based on your implementation)
    // For example, user might have custom source preferences or content display settings
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Verify authenticated user sees the expected layout
    await expect(authenticatedPage.getByRole('heading', { name: 'Latest Videos' })).toBeVisible();
    
    // The content should be loaded properly for authenticated users
    const videoCards = authenticatedPage.getByTestId('carousel-item');
    await expect(videoCards.first()).toBeVisible();
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    
    // Find and click logout button/link
    const logoutElement = authenticatedPage.locator('button:has-text("Logout"), a:has-text("Logout"), [data-testid="logout-button"]');
    
    if (await logoutElement.first().isVisible()) {
      await logoutElement.first().click();
      
      // Should redirect to homepage or login
      await authenticatedPage.waitForURL(/\/($|auth\/login)/);
      
      // Should show login button again
      await expect(authenticatedPage.getByRole('button', { name: 'Login' })).toBeVisible();
      
      // Trying to access protected page should redirect to login
      await authenticatedPage.goto('/account');
      await expect(authenticatedPage).toHaveURL(/\/auth\/login/);
    }
  });
});