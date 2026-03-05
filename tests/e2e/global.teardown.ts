import { TestDataManager } from './utils/TestDataManager';

export default async function globalTeardown() {
  console.log('Starting global teardown...');

  // Clean up test data (playlists, etc.) but NOT test users
  // We keep test users persistent for reuse across test runs
  try {
    const testDataManager = new TestDataManager();

    // Clean up test data for the correct number of workers (match config)
    const maxWorkers = process.env.CI ? 1 : 2; // Match the config from playwright.config.ts

    for (let workerId = 0; workerId < maxWorkers; workerId++) {
      try {
        const testUser = await testDataManager.getOrCreateTestUser(workerId);
        await testDataManager.cleanupUserTestData(testUser.id);
        console.log(`Cleaned up test data for worker ${workerId}`);
      } catch (error) {
        console.warn(
          `Failed to cleanup test data for worker ${workerId}:`,
          error
        );
      }
    }

    console.log(
      'Test data cleaned up successfully (users preserved for reuse)'
    );
  } catch (error) {
    console.warn('Failed to cleanup test data:', error);
  }

  // Keep authentication files for reuse - only clean up if they're very old
  // This is handled by the setup process, so we don't need to do it here

  console.log('Global teardown completed');
}
