import { test as teardown } from '@playwright/test';
import { TestDataManager } from './utils/TestDataManager';
import path from 'path';
import fs from 'fs';

teardown('cleanup test users and auth states', async () => {
  console.log('Starting global teardown...');

  // Clean up test users
  try {
    const testDataManager = new TestDataManager();
    await testDataManager.cleanupAllTestUsers();
    console.log('Test users cleaned up successfully');
  } catch (error) {
    console.warn('Failed to cleanup test users:', error);
  }

  // Clean up authentication files
  try {
    const authDir = path.join(process.cwd(), '.auth');
    if (fs.existsSync(authDir)) {
      const files = fs.readdirSync(authDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(authDir, file);
          fs.unlinkSync(filePath);
          console.log(`Cleaned up auth file: ${file}`);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup auth files:', error);
  }

  console.log('Global teardown completed');
});