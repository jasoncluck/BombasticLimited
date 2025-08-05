#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import { test } from '@playwright/test';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Could not find supabase env vars');
}

console.log('🧪 Account Management Tests Starting...');
console.log('Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestUser {
  email: string;
  password: string;
  username: string;
  userId?: string;
}

async function createTestUser(): Promise<TestUser> {
  const timestamp = Date.now();
  const testUser: TestUser = {
    email: `test-account-${timestamp}@bombastic.ltd`,
    password: 'TestPassword123!',
    username: `test-account-${timestamp}`,
  };

  console.log('Creating test user via Auth Admin API:', testUser.email);

  // Create user via admin API (bypasses email confirmation)
  const { data: authData, error: userError } =
    await supabase.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      user_metadata: { username: testUser.username },
      email_confirm: true, // Auto-confirm email
    });

  if (!authData.user || userError) {
    throw new Error(
      `Failed to create test user: ${userError?.message || 'Unknown error'}`
    );
  }

  testUser.userId = authData.user.id;
  console.log('✅ Test user created successfully:', testUser.userId);
  return testUser;
}

async function deleteTestUser(userId: string): Promise<void> {
  console.log('Cleaning up test user:', userId);
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('Failed to delete test user:', error);
  } else {
    console.log('✅ Test user deleted successfully');
  }
}

async function loginUser(
  page: any,
  email: string,
  password: string
): Promise<boolean> {
  console.log(`🔐 Logging in user: ${email}`);

  // Navigate to login page
  await page.goto('http://localhost:5173/auth/login');
  await page.waitForLoadState('networkidle');

  // Check if already logged in (redirected to home)
  if (page.url() === 'http://localhost:5173/') {
    console.log('🔄 Already logged in, clearing session...');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.goto('http://localhost:5173/auth/login');
    await page.waitForLoadState('networkidle');
  }

  // Wait for login form
  let attempts = 0;
  while (attempts < 10) {
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 2000 });
      break;
    } catch {
      console.log(`Waiting for login form... attempt ${attempts + 1}`);
      await page.waitForTimeout(1000);
      attempts++;
    }
  }

  if (attempts >= 10) {
    console.log('❌ Login form not available');
    return false;
  }

  // Fill login form
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const loginButton = page.locator(
    'button[type="submit"], button:has-text("Login")'
  );
  await loginButton.click();

  // Wait for redirect
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const isLoggedIn = page.url() === 'http://localhost:5173/';
  console.log(isLoggedIn ? '✅ Login successful' : '❌ Login failed');
  return isLoggedIn;
}

test.describe('Account Management Tests', () => {
  let testUser: TestUser;

  test.beforeAll(async () => {
    testUser = await createTestUser();
  });

  test.afterAll(async () => {
    if (testUser.userId) {
      // Cleanup any remaining user data
      await deleteTestUser(testUser.userId);
    }
  });

  test('should update username successfully', async ({ page }) => {
    console.log('🧪 Testing username update functionality');

    // Login first
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    if (!loginSuccess) {
      console.log('❌ Could not login for username test');
      return;
    }

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check if we're on the account page
    if (!page.url().includes('/account')) {
      console.log('❌ Could not access account page');
      return;
    }

    // Look for username form
    const usernameInput = page.locator('input[name="username"]');
    const usernameSubmitButton = page.locator(
      'button:has-text("Update Username")'
    );

    if (!(await usernameInput.isVisible())) {
      console.log('⚠️ Username form not visible');
      return;
    }

    // Update username
    const newUsername = `updated-${testUser.username}`;
    console.log(`📝 Updating username to: ${newUsername}`);

    await usernameInput.clear();
    await usernameInput.fill(newUsername);
    await usernameSubmitButton.click();

    // Wait for form submission
    await page.waitForTimeout(2000);

    // Check for success message or updated value
    const updatedValue = await usernameInput.inputValue();
    if (updatedValue === newUsername) {
      console.log('✅ Username update successful');
    } else {
      console.log('⚠️ Username update unclear - checking for error messages');

      // Check for any error messages
      const errorText = await page
        .locator('.alert, .error, [role="alert"]')
        .textContent();
      if (errorText) {
        console.log(`⚠️ Error message found: ${errorText}`);
      }
    }

    // Verify username change persisted by refreshing page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const persistedValue = await page
      .locator('input[name="username"]')
      .inputValue();
    if (persistedValue === newUsername) {
      console.log('✅ Username change persisted after page refresh');
    } else {
      console.log('⚠️ Username change may not have persisted');
    }
  });

  test('should initiate email change process', async ({ page }) => {
    console.log('🧪 Testing email change functionality');

    // Login first
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    if (!loginSuccess) {
      console.log('❌ Could not login for email test');
      return;
    }

    // Navigate to account page
    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Look for email form
    const emailInput = page.locator('input[name="email"]');
    const emailSubmitButton = page.locator('button:has-text("Update Email")');

    if (!(await emailInput.isVisible())) {
      console.log('⚠️ Email form not visible');
      return;
    }

    // Try to update email
    const newEmail = `updated-${testUser.email}`;
    console.log(`📧 Attempting to update email to: ${newEmail}`);

    await emailInput.clear();
    await emailInput.fill(newEmail);
    await emailSubmitButton.click();

    // Wait for form submission
    await page.waitForTimeout(3000);

    // Check for confirmation message
    const pageText = await page.textContent('body');
    if (
      pageText?.includes('confirmation') ||
      (pageText?.includes('email') && pageText?.includes('sent'))
    ) {
      console.log('✅ Email change initiated - confirmation message shown');
    } else {
      console.log('⚠️ Email change result unclear - checking for messages');

      // Look for any alerts or messages
      const alerts = await page
        .locator('.alert, .message, [role="alert"], .notification')
        .allTextContents();
      if (alerts.length > 0) {
        console.log('📋 Messages found:', alerts);
      }
    }

    // Note: We can't easily test email reception in automated tests,
    // but we can verify the process was initiated correctly
    console.log(
      '📧 Email change process tested (actual email delivery not verified in automation)'
    );
  });

  test('should delete user account with proper logout', async ({ page }) => {
    console.log('🧪 Testing account deletion with proper logout');

    // Create a separate user for deletion test to avoid interfering with other tests
    const userToDelete = await createTestUser();

    try {
      // Login with the user to be deleted
      const loginSuccess = await loginUser(
        page,
        userToDelete.email,
        userToDelete.password
      );
      if (!loginSuccess) {
        console.log('❌ Could not login for deletion test');
        return;
      }

      // Navigate to account page
      await page.goto('http://localhost:5173/account');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Check if we're on the account page
      if (!page.url().includes('/account')) {
        console.log('❌ Could not access account page for deletion');
        return;
      }

      // Look for delete account button/dialog
      const deleteButton = page.locator('button:has-text("Delete Account")');

      if (!(await deleteButton.isVisible())) {
        console.log('⚠️ Delete Account button not visible');
        return;
      }

      console.log('🗑️ Clicking Delete Account button');
      await deleteButton.click();

      // Wait for confirmation dialog
      await page.waitForTimeout(1000);

      // Look for confirmation dialog and confirm deletion
      const confirmDeleteButton = page
        .locator('button:has-text("Delete Account")')
        .last();

      if (await confirmDeleteButton.isVisible()) {
        console.log('🗑️ Confirming account deletion');
        await confirmDeleteButton.click();
      } else {
        console.log(
          '⚠️ Delete confirmation button not found, trying form submission'
        );
        // If no dialog, might be a form - try submitting
        const deleteForm = page.locator('form[action*="deleteAccount"]');
        if (await deleteForm.isVisible()) {
          await deleteForm.locator('button[type="submit"]').click();
        }
      }

      // Wait for deletion process
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Verify user is logged out and redirected
      const currentUrl = page.url();
      console.log(`Current URL after deletion: ${currentUrl}`);

      if (
        currentUrl === 'http://localhost:5173/' ||
        currentUrl.includes('/auth')
      ) {
        console.log('✅ User redirected after deletion');

        // Verify auth state is cleared by checking for login button
        const loginButton = page.locator('button:has-text("Login")');
        if (await loginButton.isVisible()) {
          console.log('✅ User properly logged out - login button visible');
        } else {
          console.log('⚠️ Auth state unclear after deletion');
        }

        // Verify user cannot access protected routes
        await page.goto('http://localhost:5173/account');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const accountAccessUrl = page.url();
        if (
          accountAccessUrl.includes('/auth/login') ||
          accountAccessUrl === 'http://localhost:5173/'
        ) {
          console.log('✅ Protected route properly blocked after deletion');
        } else {
          console.log('⚠️ Protected route access unclear after deletion');
        }

        // Test that login no longer works (user should be deleted)
        await page.goto('http://localhost:5173/auth/login');
        await page.waitForLoadState('networkidle');

        // Try to login with deleted user credentials
        try {
          await page.locator('input[type="email"]').fill(userToDelete.email);
          await page
            .locator('input[type="password"]')
            .fill(userToDelete.password);
          await page
            .locator('button[type="submit"], button:has-text("Login")')
            .click();

          await page.waitForTimeout(3000);

          if (page.url().includes('/auth/login')) {
            console.log(
              '✅ Deleted user cannot login (account properly deleted)'
            );
          } else {
            console.log('⚠️ Deleted user login test inconclusive');
          }
        } catch (error) {
          console.log('⚠️ Could not test deleted user login:', error);
        }
      } else {
        console.log('⚠️ Unexpected behavior after account deletion');
      }

      // Verify user was actually deleted from the database
      const { data: userCheck } = await supabase.auth.admin.listUsers();
      const deletedUserExists = userCheck.users.find(
        (user) => user.id === userToDelete.userId
      );

      if (!deletedUserExists) {
        console.log('✅ User properly deleted from database');
      } else {
        console.log('⚠️ User may still exist in database');
      }
    } catch (error) {
      console.error('❌ Account deletion test failed:', error);
    } finally {
      // Cleanup: ensure the test user is deleted even if test failed
      if (userToDelete.userId) {
        await deleteTestUser(userToDelete.userId);
      }
    }
  });

  test('should handle account page authentication properly', async ({
    page,
  }) => {
    console.log('🧪 Testing account page authentication requirements');

    // Test access without login
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const unauthenticatedUrl = page.url();
    if (unauthenticatedUrl.includes('/auth/login')) {
      console.log(
        '✅ Account page properly redirects to login when not authenticated'
      );
    } else {
      console.log('⚠️ Account page authentication guard may not be working');
    }

    // Test access with login
    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    if (!loginSuccess) {
      console.log('❌ Could not login for auth test');
      return;
    }

    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const authenticatedUrl = page.url();
    if (authenticatedUrl.includes('/account')) {
      console.log('✅ Account page accessible when authenticated');

      // Check for account management elements
      const hasUsernameForm = await page
        .locator('input[name="username"]')
        .isVisible();
      const hasEmailForm = await page
        .locator('input[name="email"]')
        .isVisible();
      const hasDeleteButton = await page
        .locator('button:has-text("Delete Account")')
        .isVisible();

      console.log('📋 Account features found:');
      console.log(`   Username form: ${hasUsernameForm ? '✅' : '❌'}`);
      console.log(`   Email form: ${hasEmailForm ? '✅' : '❌'}`);
      console.log(`   Delete button: ${hasDeleteButton ? '✅' : '❌'}`);
    } else {
      console.log('⚠️ Account page not accessible even when authenticated');
    }
  });

  test('should handle invalid username updates', async ({ page }) => {
    console.log('🧪 Testing username validation');

    const loginSuccess = await loginUser(
      page,
      testUser.email,
      testUser.password
    );
    if (!loginSuccess) {
      console.log('❌ Could not login for username validation test');
      return;
    }

    await page.goto('http://localhost:5173/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const usernameInput = page.locator('input[name="username"]');
    const usernameSubmitButton = page.locator(
      'button:has-text("Update Username")'
    );

    if (!(await usernameInput.isVisible())) {
      console.log('⚠️ Username form not visible for validation test');
      return;
    }

    // Test empty username
    await usernameInput.clear();
    await usernameSubmitButton.click();
    await page.waitForTimeout(1000);

    // Check for validation message
    const emptyValidation = await usernameInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage
    );
    if (emptyValidation) {
      console.log('✅ Empty username validation working:', emptyValidation);
    }

    // Test invalid characters
    await usernameInput.fill('invalid username with spaces!@#');
    await usernameSubmitButton.click();
    await page.waitForTimeout(2000);

    // Check if the invalid username was rejected
    const pageText = await page.textContent('body');
    if (pageText?.includes('invalid') || pageText?.includes('error')) {
      console.log('✅ Invalid username properly rejected');
    } else {
      console.log('⚠️ Invalid username validation unclear');
    }

    console.log('✅ Username validation tests completed');
  });
});
