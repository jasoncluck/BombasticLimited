import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// Helper to clean up specific test data without full reset
export async function cleanupTestData(testId: string) {
  // Clean up any test-specific data using the testId
  // This is much faster than a full DB reset
  console.log(`🧹 Cleaning up test data for ${testId}`);

  // Example: Delete test users created during this test
  // await supabaseAdmin.from('users').delete().like('email', `%test-${testId}%`);
}

// Helper to create test data quickly
export async function createTestUser(testId: string) {
  const email = `test-${testId}-${Date.now()}@example.com`;
  const password = 'testpassword123';

  // Create user logic here
  return { email, password };
}
