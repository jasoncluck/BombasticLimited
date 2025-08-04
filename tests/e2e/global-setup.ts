import { resetDatabase, shouldResetDatabase } from './utils/db-utils';

async function globalSetup() {
  console.log('🧪 Setting up test environment...');

  // Set default environment variables for tests (assumes Supabase is already running)
  process.env.SUPABASE_URL =
    process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  console.log('✅ Environment variables set');

  // Reset database once at the beginning if needed
  if (shouldResetDatabase()) {
    console.log('🔄 Resetting database once for test suite...');
    await resetDatabase();
  } else {
    console.log(
      '🔧 Using existing database state (set RESET_DB=true to reset)'
    );
  }

  console.log('✅ Global setup complete');
}

export default globalSetup;
