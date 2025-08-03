import { execSync } from 'child_process';

async function globalTeardown() {
  // Only stop Supabase in CI, keep it running locally for development
  if (process.env.CI) {
    console.log('🛑 Stopping Supabase (CI environment)...');
    execSync('supabase stop', { stdio: 'inherit' });
  } else {
    console.log('🔄 Keeping Supabase running for local development');
  }
}

export default globalTeardown;
