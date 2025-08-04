async function globalTeardown() {
  console.log('🧪 Test suite complete - keeping environment for development');
  // Note: Supabase remains running for local development
}

export default globalTeardown;
