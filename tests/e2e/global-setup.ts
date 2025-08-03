import { execSync } from 'child_process';
import { type FullConfig } from '@playwright/test';
import { resetDatabase, shouldResetDatabase } from './utils/db-utils';

async function globalSetup(config: FullConfig) {
  try {
    // Check if Supabase is already running
    const status = execSync('supabase status', { encoding: 'utf-8' });
    console.log('✅ Supabase is already running');

    // Extract the anon key from status output
    const anonKeyMatch = status.match(/anon key: (.+)/);
    const serviceRoleKeyMatch = status.match(/service_role key: (.+)/);

    if (anonKeyMatch) {
      process.env.SUPABASE_ANON_KEY = anonKeyMatch[1];
    }
    if (serviceRoleKeyMatch) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKeyMatch[1];
    }
  } catch (error) {
    console.log('🚀 Starting Supabase...');
    execSync('supabase start', { stdio: 'inherit' });

    // Wait for services to be fully ready and get keys
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const status = execSync('supabase status', { encoding: 'utf-8' });
    const anonKeyMatch = status.match(/anon key: (.+)/);
    const serviceRoleKeyMatch = status.match(/service_role key: (.+)/);

    if (anonKeyMatch) {
      process.env.SUPABASE_ANON_KEY = anonKeyMatch[1];
    }
    if (serviceRoleKeyMatch) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKeyMatch[1];
    }

    console.log('✅ Supabase started successfully');
  }

  // Generate fresh types
  try {
    execSync('npm run generate-types', { stdio: 'inherit' });
    console.log('✅ Database types generated');
  } catch (error) {
    console.warn('⚠️ Could not generate types, continuing...');
  }

  // Reset database once at the beginning if needed
  if (shouldResetDatabase()) {
    console.log('🔄 Resetting database once for test suite...');
    await resetDatabase();
  } else {
    console.log(
      '🔧 Using existing database state (set RESET_DB=true to reset)'
    );
  }
}

export default globalSetup;
