#!/usr/bin/env node

/**
 * Test script to validate the authentication model setup
 * This can be run independently to test the TestDataManager and auth setup
 */

import { TestDataManager } from '../tests/e2e/utils/TestDataManager.js';

async function testAuthenticationSetup() {
  console.log('🧪 Testing Playwright Authentication Model Setup...\n');

  try {
    // Test 1: Create TestDataManager
    console.log('1. Creating TestDataManager...');
    const testDataManager = new TestDataManager();
    console.log('✅ TestDataManager created successfully\n');

    // Test 2: Create test user
    console.log('2. Creating test user...');
    const testUser = await testDataManager.createTestUser(999); // Use 999 as test worker ID
    console.log(`✅ Test user created: ${testUser.email}`);
    console.log(`   Username: ${testUser.username}`);
    console.log(`   ID: ${testUser.id}\n`);

    // Test 3: Authenticate test user
    console.log('3. Testing authentication...');
    const authData = await testDataManager.authenticateTestUser(testUser);
    console.log('✅ Authentication successful');
    console.log(`   Session expires: ${authData.session?.expires_at}\n`);

    // Test 4: Create test playlist
    console.log('4. Creating test playlist...');
    const playlist = await testDataManager.createTestPlaylist(testUser.id, 'Test Setup Validation Playlist');
    console.log(`✅ Test playlist created: ${playlist.name} (ID: ${playlist.id})\n`);

    // Test 5: Cleanup test data
    console.log('5. Cleaning up test data...');
    await testDataManager.cleanupUserTestData(testUser.id);
    console.log('✅ Test data cleaned up\n');

    // Test 6: Cleanup test user
    console.log('6. Cleaning up test user...');
    await testDataManager.cleanupTestUser(999);
    console.log('✅ Test user cleaned up\n');

    console.log('🎉 All tests passed! Authentication model is properly configured.\n');
    console.log('Next steps:');
    console.log('- Run `npm run test:e2e` to execute the full test suite');
    console.log('- Check the .auth/ directory for authentication states during tests');
    console.log('- Review the tests/e2e/README.md for usage documentation');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('- Check that Supabase is running (npm run test:setup)');
    console.error('- Verify SUPABASE_SERVICE_ROLE_KEY is set');
    console.error('- Ensure database is properly migrated');
    
    process.exit(1);
  }
}

// Run the test
testAuthenticationSetup();