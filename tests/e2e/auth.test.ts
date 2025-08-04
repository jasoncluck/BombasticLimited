import { test, expect } from '@playwright/test';
import { TestDataManager } from './utils/test-data';

test.describe('User Authentication', () => {
  let testDataManager: TestDataManager;
  let testUser: {
    userId: string;
    email: string;
    username: string;
    password: string;
  };

  test.beforeAll(async () => {
    testDataManager = new TestDataManager();
    testUser = await testDataManager.createTestIntegrationUser();
  });

  test.afterAll(async () => {
    await testDataManager.cleanupTestData();
  });

  test('user can log in with test credentials', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');

    // Click the login button
    const loginButton = page.locator('button').filter({ hasText: /login/i });
    await expect(loginButton).toBeVisible();
    await loginButton.click();

    // Wait for login form/page to load
    await page.waitForLoadState('networkidle');

    // Check if we're on the login page or if a modal appeared
    // This will depend on your login implementation
    await expect(page).toHaveURL(/.*auth.*|.*login.*/);

    // Fill in the login form with test user credentials
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    );

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await emailInput.fill(testUser.email);
    // Use the password that was used to create the user via RPC
    await passwordInput.fill(testUser.password);

    // Submit the login form
    const submitButton = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /sign in|login|submit/i });
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Wait for login to complete and redirect
    await page.waitForLoadState('networkidle');

    // Verify successful login by checking if login button is no longer visible
    // and user is redirected back to homepage or dashboard
    await expect(
      page.locator('button').filter({ hasText: /logout|sign out|profile/i })
    ).toBeVisible({ timeout: 10000 });

    // Or check for user-specific content
    await expect(
      page.locator('text=Welcome').or(page.locator(`text=${testUser.username}`))
    ).toBeVisible({ timeout: 5000 });
  });

  test('login form validates required fields', async ({ page }) => {
    // Navigate to login
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loginButton = page.locator('button').filter({ hasText: /login/i });
    await loginButton.click();
    await page.waitForLoadState('networkidle');

    // Try to submit without filling fields
    const submitButton = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /sign in|login|submit/i });
    await submitButton.click();

    // Check for validation messages
    await expect(
      page
        .locator('text=required')
        .or(page.locator('text=email').and(page.locator('text=invalid')))
    ).toBeVisible({ timeout: 5000 });
  });

  test('login fails with invalid credentials', async ({ page }) => {
    // Navigate to login
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loginButton = page.locator('button').filter({ hasText: /login/i });
    await loginButton.click();
    await page.waitForLoadState('networkidle');

    // Fill with invalid credentials
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    );

    await emailInput.fill('invalid@example.com');
    await passwordInput.fill('wrongpassword');

    const submitButton = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /sign in|login|submit/i });
    await submitButton.click();

    // Check for error message
    await expect(
      page
        .locator('text=invalid')
        .or(page.locator('text=error').or(page.locator('text=failed')))
    ).toBeVisible({ timeout: 5000 });
  });
});
