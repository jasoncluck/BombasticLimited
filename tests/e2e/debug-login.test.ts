import { test, expect, type Page } from '@playwright/test';
import { TestDataManager } from './utils/test-data';

test.describe('Debug Login', () => {
  let testDataManager: TestDataManager;

  test.beforeAll(async () => {
    testDataManager = new TestDataManager();
  });

  test.afterAll(async () => {
    if (testDataManager) {
      await testDataManager.cleanupTestData();
    }
  });

  async function debugLogin(
    page: Page,
    email: string,
    password: string
  ): Promise<boolean> {
    console.log('🔐 Debug login for:', email);

    await page.goto('http://localhost:5173/auth/login');
    await page.waitForLoadState('networkidle');
    console.log('📍 Current URL after goto:', page.url());

    // Check if we're already logged in (redirected to home)
    if (page.url() === 'http://localhost:5173/') {
      console.log('✅ Already logged in');
      return true;
    }

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    console.log('✅ Found email input');

    // Fill login form
    await page.locator('input[type="email"]').fill(email);
    console.log('✅ Filled email');

    await page.locator('input[type="password"]').fill(password);
    console.log('✅ Filled password');

    // Click the login button
    const loginButton = page.getByRole('button', { name: 'Login' });
    console.log('✅ Found login button');

    await loginButton.click();
    console.log('✅ Clicked login button');

    // Wait for redirect and check result
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const isLoggedIn = currentUrl === 'http://localhost:5173/';

    console.log(`📍 Final URL: ${currentUrl}`);
    console.log(isLoggedIn ? '✅ Login successful' : '❌ Login failed');

    return isLoggedIn;
  }

  test('debug login process', async ({ page }) => {
    console.log('🧪 Debugging login process...');

    // Create a test user
    const testUser = await testDataManager.createTestIntegrationUser();
    console.log('✅ Created test user:', testUser.email);

    // Test login
    const loginSuccess = await debugLogin(
      page,
      testUser.email,
      testUser.password
    );
    expect(loginSuccess).toBe(true);

    console.log('✅ Debug login test passed');
  });
});
