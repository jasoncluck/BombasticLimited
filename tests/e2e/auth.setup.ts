import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { TestDataManager } from './utils/TestDataManager';

const authDir = path.join(process.cwd(), '.auth');

export default async function globalSetup(config: FullConfig) {

  // Create auth directory if it doesn't exist
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Check if we already have valid auth files - skip setup if they exist and are recent
  const testDataManager = new TestDataManager();
  const maxWorkers = Math.min(config.workers || 2, 2); // Reduced worker count to prevent server overload


  // Check if all required auth files exist and are recent (less than 24 hours old)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  let allAuthFilesValid = true;

  for (let workerIndex = 0; workerIndex < maxWorkers; workerIndex++) {
    const authFile = path.join(authDir, `user-${workerIndex}.json`);

    if (!fs.existsSync(authFile)) {
      allAuthFilesValid = false;
      break;
    }

    const stats = fs.statSync(authFile);
    if (stats.mtime.getTime() < twentyFourHoursAgo) {
      allAuthFilesValid = false;
      break;
    }
  }

  if (allAuthFilesValid) {
    return;
  }

  // Clean up old auth files older than 1 hour
  const files = fs.readdirSync(authDir);
  for (const file of files) {
    const filePath = path.join(authDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.mtime.getTime() < oneHourAgo) {
        fs.unlinkSync(filePath);
      }
    }
  }


  for (let workerIndex = 0; workerIndex < maxWorkers; workerIndex++) {
    const authFile = path.join(authDir, `user-${workerIndex}.json`);

    // Skip if auth file already exists and is recent
    if (fs.existsSync(authFile)) {
      const stats = fs.statSync(authFile);
      if (stats.mtime.getTime() > twentyFourHoursAgo) {
        continue;
      }
    }

    const browser = await chromium.launch({
      args: [
        '--disable-background-networking',
        '--disable-background-timer-throttling',
      ],
    });
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'X-Test-Environment': 'true',
        'X-Test-Worker-ID': workerIndex.toString(),
      },
    });
    const page = await context.newPage();

    try {
      const testUser = await testDataManager.getOrCreateTestUser(workerIndex);


      // Navigate to login page
      const baseUrl =
        config.projects[0].use?.baseURL || 'http://localhost:5173';
      await page.goto(`${baseUrl}/auth/login`);


      // Fill in login form
      const emailField = page.locator('input[type="email"]');
      const passwordField = page.locator('input[type="password"]');
      const loginButton = page.locator('button[type="submit"]');

      await emailField.waitFor({ state: 'visible' });
      await emailField.fill(testUser.email);

      await passwordField.waitFor({ state: 'visible' });
      await passwordField.fill(testUser.password);

      // Submit login
      await loginButton.click();

      // Wait for navigation to complete after login
      await page.waitForURL((url) => !url.href.includes('/auth/login'), {
        timeout: 10000,
      });

      // Wait for Profile button to confirm authentication
      await page.waitForSelector('button:has-text("Profile")', {
        timeout: 5000,
      });


      // Save authentication state
      await context.storageState({ path: authFile });

    } catch (error) {
      console.error(`Failed to set up auth for worker ${workerIndex}:`, error);
      // Continue with other workers
    } finally {
      await context.close();
      await browser.close();
    }
  }

}
