import { TestDataManager } from './utils/TestDataManager';

export default async function globalTeardown() {

  // Clean up test data (playlists, etc.) but NOT test users
  // We keep test users persistent for reuse across test runs
  try {
    const testDataManager = new TestDataManager();

    // Clean up test data for all known workers
    for (let workerId = 0; workerId < 10; workerId++) {
      try {
        const testUser = await testDataManager.getOrCreateTestUser(workerId);
        await testDataManager.cleanupUserTestData(testUser.id);
      } catch (error) {
      }
    }

  } catch (error) {
  }

  // Keep authentication files for reuse - only clean up if they're very old
  // This is handled by the setup process, so we don't need to do it here

}
