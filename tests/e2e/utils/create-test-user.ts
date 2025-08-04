import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createPersistentTestUser(): Promise<void> {
  const testUser = {
    email: 'test-browser@bombastic.ltd',
    password: 'TestPassword123!',
    username: 'test-browser',
  };

  console.log('🔧 Creating persistent test user:', testUser.email);

  try {
    // Create user via admin API (bypasses email confirmation)
    const { data: authData, error: userError } =
      await supabase.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        user_metadata: { username: testUser.username },
        email_confirm: true, // Auto-confirm email
      });

    if (userError && !userError.message.includes('already exists')) {
      throw new Error(`Failed to create test user: ${userError.message}`);
    }

    if (authData?.user) {
      console.log('✅ Test user created successfully:', authData.user.id);
    } else {
      console.log('✅ Test user already exists');
    }

    console.log('📝 Test credentials:');
    console.log('   Email:', testUser.email);
    console.log('   Password:', testUser.password);
  } catch (error) {
    console.error('❌ Failed to create test user:', error);
  }
}

// Run the creation
createPersistentTestUser()
  .then(() => {
    console.log('🎉 Persistent test user ready for browser testing!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
