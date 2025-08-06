import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { TestDataManager } from './utils/TestDataManager';

const authDir = path.join(process.cwd(), '.auth');

setup('authenticate test users', async ({ page }, workerInfo) => {
  // Create unique authentication state file for this worker
  const authFile = path.join(authDir, `user-${workerInfo.workerIndex}.json`);

  const testDataManager = new TestDataManager();
  const testUser = await testDataManager.getOrCreateTestUser(workerInfo.workerIndex);

  console.log(`Setting up authentication for worker ${workerInfo.workerIndex} with user ${testUser.email}`);

  // Navigate to login page
  await page.goto('/auth/login');

  // Fill in login form
  await page.getByLabel('Email').fill(testUser.email);
  await page.getByLabel('Password').fill(testUser.password);
  
  // Submit login
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for successful login and redirect
  await expect(page).toHaveURL('/');
  
  // Verify we're logged in by checking for user-specific elements
  await expect(page.getByRole('button', { name: /account|profile|logout/i })).toBeVisible({
    timeout: 10000
  });

  // Save authentication state
  await page.context().storageState({ path: authFile });
  
  console.log(`Authentication saved for worker ${workerInfo.workerIndex} at ${authFile}`);
});

setup('cleanup old authentication states', async () => {
  const fs = require('fs');
  const path = require('path');
  
  const authDir = path.join(process.cwd(), '.auth');
  
  // Create auth directory if it doesn't exist
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    return;
  }
  
  // Clean up old auth files older than 1 hour
  const files = fs.readdirSync(authDir);
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  for (const file of files) {
    const filePath = path.join(authDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.mtime.getTime() < oneHourAgo) {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up old auth file: ${file}`);
    }
  }
});