import { test, expect, type Page } from '@playwright/test';
import { TestDataManager } from './utils/test-data';

test.describe('Account Management', () => {
  let testDataManager: TestDataManager;

  test.beforeAll(async () => {
    testDataManager = new TestDataManager();
  });

  test.afterAll(async () => {
    if (testDataManager) {
      await testDataManager.cleanupTestData();
    }
  });

  async function loginUser(
    page: Page,
    email: string,
    password: string
  ): Promise<boolean> {
    console.log('🔐 Attempting to log in user:', email);

    await page.goto('http://localhost:5173/auth/login');
    await page.waitForLoadState('networkidle');

    // Check if we're already logged in (redirected to home)
    if (page.url() === 'http://localhost:5173/') {
      console.log('✅ Already logged in');
      return true;
    }

    // Wait for login form to be available with longer timeout
    let attempts = 0;
    while (attempts < 15) {
      try {
        await page.locator('input[type="email"]').waitFor({ timeout: 2000 });
        break;
      } catch {
        console.log(`⏳ Waiting for login form... (attempt ${attempts + 1})`);
        await page.waitForTimeout(1000);
        attempts++;
      }
    }

    if (attempts >= 15) {
      console.log('❌ Login form not available');
      return false;
    }

    // Clear any existing values and fill login form
    await page.locator('input[type="email"]').clear();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').clear();
    await page.locator('input[type="password"]').fill(password);

    // Click the login button in the form (avoid navigation login button)
    const loginButton = page.locator('form button:has-text("Login")');
    await loginButton.click();

    // Wait for redirect and verify login success with longer timeout
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check for error messages first
    const errorAlert = page.locator(
      'div[role="alert"]:has-text("Invalid login credentials")'
    );
    const hasError = await errorAlert.isVisible().catch(() => false);

    if (hasError) {
      console.log('❌ Login failed: Invalid credentials');
      return false;
    }

    // Check if redirected to home page (successful login)
    const currentUrl = page.url();
    const isLoggedIn = currentUrl === 'http://localhost:5173/';

    console.log(`Current URL after login attempt: ${currentUrl}`);
    console.log(isLoggedIn ? '✅ Login successful' : '❌ Login failed');

    return isLoggedIn;
  }

  test('should delete user account with proper logout', async ({ page }) => {
    console.log('🧪 Testing account deletion with proper logout...');

    // Create a test user
    const userToDelete = await testDataManager.createTestIntegrationUser();
    console.log('Created test user for deletion:', userToDelete.email);

    // Login as the user
    const loginSuccess = await loginUser(
      page,
      userToDelete.email,
      userToDelete.password
    );
    expect(loginSuccess).toBe(true);

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');

    // Verify we're on the account page
    expect(page.url()).toBe('http://localhost:5173/account');

    // Find and click the delete account button to open modal
    const deleteButton = page.getByRole('button', { name: 'Delete Account' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for the confirmation dialog to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

    // Click the confirm delete button in the modal
    const confirmDeleteButton = page
      .getByRole('button', { name: 'Delete Account' })
      .last(); // The one in the modal
    await confirmDeleteButton.click();

    // Wait for the action to complete and page to reload
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Verify user is logged out and redirected to home
    const currentUrl = page.url();
    console.log('Current URL after deletion:', currentUrl);

    // Should be redirected to home page and logged out
    expect(currentUrl).toBe('http://localhost:5173/');

    // Try to access account page - should redirect to auth
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should be redirected to auth/login page because user is logged out
    expect(page.url()).toBe('http://localhost:5173/auth/login');

    console.log('✅ Account deletion and logout test passed');
  });

  test('should update username successfully', async ({ page }) => {
    console.log('🧪 Testing username update...');

    // Create a test user
    const testUser = await testDataManager.createTestIntegrationUser();

    // Login as the user
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    expect(loginSuccess).toBe(true);

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');

    // Verify we're on the account page
    expect(page.url()).toBe('http://localhost:5173/account');

    // Wait for page to be ready and find the username input
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const newUsername = `testuser${Date.now()}`;

    // Update username - find the textbox with accessible name "Username"
    await page.getByRole('textbox', { name: 'Username' }).fill(newUsername);

    // Find the update button associated with the username field
    await page.getByRole('button', { name: 'Update' }).nth(1).click(); // Second update button is for username

    // Verify success message
    await expect(page.locator('.alert, [role="alert"]')).toContainText(
      'Updated username'
    );
  });

  test('should initiate email change process', async ({ page }) => {
    console.log('🧪 Testing email change initiation...');

    // Create a test user
    const testUser = await testDataManager.createTestIntegrationUser();

    // Wait for user to be fully created and synced
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Login as the user
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    expect(loginSuccess).toBe(true);

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');

    // Wait for page to be ready and find the email input
    await page.waitForTimeout(1000);

    // Update email to a new one
    const newEmail = `updated-${Date.now()}@bombastic.ltd`;

    // Use accessible role selector for the email input
    await page.getByRole('textbox', { name: 'Email' }).fill(newEmail);

    // Find the update button associated with the email field (first Update button)
    await page.getByRole('button', { name: 'Update' }).first().click();

    // Wait for confirmation message
    await page.waitForTimeout(2000);

    // Check for confirmation message about email verification
    const confirmationMessage = page.locator(
      'text=Check your email for verification'
    );
    await expect(confirmationMessage).toBeVisible();

    console.log('✅ Email change initiation test passed');
  });

  test('should handle invalid username updates', async ({ page }) => {
    console.log('🧪 Testing invalid username updates...');

    // Create a test user
    const testUser = await testDataManager.createTestIntegrationUser();

    // Wait for user to be fully created and synced
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Login as the user
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    expect(loginSuccess).toBe(true);

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');

    // Wait for page to be ready and find the username input
    await page.waitForTimeout(1000);

    // Test invalid username (too short)
    await page.getByRole('textbox', { name: 'Username' }).fill('ab'); // Too short

    // Find the update button associated with the username field (second Update button)
    await page.getByRole('button', { name: 'Update' }).nth(1).click();

    // Wait for error message
    await page.waitForTimeout(2000);

    // Check for error message
    const errorMessage = page.locator(
      'text=Username must be at least 3 characters'
    );
    await expect(errorMessage).toBeVisible();

    console.log('✅ Invalid username update test passed');
  });

  test('should handle email change with invalid email', async ({ page }) => {
    console.log('🧪 Testing email change with invalid email...');

    // Create a test user
    const testUser = await testDataManager.createTestIntegrationUser();

    // Wait for user to be fully created and synced
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Login as the user
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    expect(loginSuccess).toBe(true);

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');

    // Wait for page to be ready and find the email input
    await page.waitForTimeout(1000);

    // Try to update to an invalid email
    await page.getByRole('textbox', { name: 'Email' }).fill('invalid-email');

    // Find the update button associated with the email field (first Update button)
    await page.getByRole('button', { name: 'Update' }).first().click();

    // Wait for error message
    await page.waitForTimeout(2000);

    // Check for error message
    const errorMessage = page.locator(
      'text=Please enter a valid email address'
    );
    await expect(errorMessage).toBeVisible();

    console.log('✅ Invalid email update test passed');
  });
});
