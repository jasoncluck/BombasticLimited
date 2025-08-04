import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

console.log('Creating test user via Auth Admin API...');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestUser {
  email: string;
  password: string;
  userId: string;
}

async function createTestUser(): Promise<TestUser | null> {
  const testEmail = 'test-login@bombastic.ltd';
  const testPassword = 'TestPassword123!';
  const testUsername = 'testlogin';

  console.log(`Creating user: ${testEmail}`);

  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    user_metadata: { username: testUsername },
    email_confirm: true, // Auto-confirm email
  });

  if (error) {
    console.error('Error creating user:', error.message);
    return null;
  }

  console.log('✅ User created successfully:', data.user.id);
  return { email: testEmail, password: testPassword, userId: data.user.id };
}

createTestUser()
  .then((result) => {
    if (result) {
      console.log('Test credentials:', result);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
