import { execSync } from 'child_process';

export async function resetDatabase() {
  console.log('🔄 Resetting database with seed data...');
  try {
    execSync('supabase db reset', { stdio: 'inherit', timeout: 60000 });

    // Wait for reset to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log('✅ Database reset complete');
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    throw error;
  }
}

export function shouldResetDatabase(): boolean {
  // Only reset in CI by default, or if explicitly requested
  return process.env.CI === 'true' || process.env.RESET_DB === 'true';
}

export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
}

export function getAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || '';
}
