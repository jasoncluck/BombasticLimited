import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function testCreateUser(): Promise<void> {
  const supabaseUrl =
    process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // First test if pgcrypto is working
  console.log('Testing pgcrypto extension...');
  const { data: cryptoTest, error: cryptoError } = await supabase.rpc('sql', {
    query: "SELECT gen_salt('bf') as salt;",
  });

  if (cryptoError) {
    console.error('Crypto test failed:', cryptoError);

    // Try direct SQL to enable extension
    console.log('Trying to enable pgcrypto...');
    const { error: enableError } = await supabase.rpc('sql', {
      query: 'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    });

    if (enableError) {
      console.error('Failed to enable pgcrypto:', enableError);
    } else {
      console.log('pgcrypto enabled successfully');
    }
  } else {
    console.log('pgcrypto is working:', cryptoTest);
  }

  const testEmail = `test-${Date.now()}@bombastic.ltd`;
  const testPassword = 'TestPassword123!';
  const testUsername = `test-user-${Date.now()}`;

  console.log('Creating test user with:', { testEmail, testUsername });

  const { data: userId, error } = await supabase.rpc('create_user', {
    email: testEmail,
    password: testPassword,
    username: testUsername,
  });

  if (error) {
    console.error('Error creating user:', error);
  } else {
    console.log('User created successfully:', userId);

    // Now try to sign in with these credentials to verify it works
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

    if (signInError) {
      console.error('Sign in failed:', signInError);
    } else {
      console.log('Sign in successful:', signInData.user?.email);
    }
  }
}

testCreateUser().catch(console.error);
