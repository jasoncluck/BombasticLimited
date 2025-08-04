#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function createBrowserTestUser() {
  const supabaseUrl =
    process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const testEmail = 'browser-test@bombastic.ltd';
  const testPassword = 'testpassword123';

  console.log('🔧 Creating browser test user:', testEmail);

  try {
    // First, try to delete any existing user with this email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(
      (user) => user.email === testEmail
    );

    if (existingUser) {
      console.log('🗑️ Deleting existing user first...');
      await supabase.auth.admin.deleteUser(existingUser.id);
      console.log('✅ Existing user deleted');
    }

    // Create the new user
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        username: 'browsertest',
      },
    });

    if (error) {
      throw new Error(`Failed to create browser test user: ${error.message}`);
    }

    console.log('✅ Browser test user created successfully:', data.user.id);
    console.log('📧 Email:', testEmail);
    console.log('🔑 Password:', testPassword);
    console.log('🎉 Browser test user ready!');

    return {
      id: data.user.id,
      email: testEmail,
      password: testPassword,
    };
  } catch (error) {
    console.error('❌ Failed to create browser test user:', error);
    throw error;
  }
}

// Run if this script is executed directly
createBrowserTestUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

export { createBrowserTestUser };
