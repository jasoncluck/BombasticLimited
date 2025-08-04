import { createClient } from '@supabase/supabase-js';

export class TestDataManager {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Creates a test user using Supabase Auth Admin API (bypasses email confirmation)
   * Returns the user ID and password for use in other test operations
   */
  async createTestUser(
    email: string,
    username: string,
    password?: string
  ): Promise<{ userId: string; password: string }> {
    // Use provided password or generate a consistent test password
    const userPassword = password || 'TestPassword123!';

    // Create user via admin API (bypasses email confirmation)
    const { data: authData, error: userError } =
      await this.supabase.auth.admin.createUser({
        email,
        password: userPassword,
        user_metadata: { username },
        email_confirm: true, // Auto-confirm email
      });

    if (!authData.user || userError) {
      throw new Error(
        `Failed to create test user: ${userError?.message || 'Unknown error'}`
      );
    }

    // Wait a moment for the trigger to create the profile
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update the profile with the desired username
    const { error: profileError } = await this.supabase
      .from('profiles')
      .update({ username })
      .eq('id', authData.user.id);

    if (profileError) {
      console.warn(
        `Warning: Could not update profile username: ${profileError.message}`
      );
    }

    console.log(`✅ Created test user: ${email} with ID: ${authData.user.id}`);
    return { userId: authData.user.id, password: userPassword };
  }

  /**
   * Creates a standard test integration user for login tests
   */
  async createTestIntegrationUser(): Promise<{
    userId: string;
    email: string;
    username: string;
    password: string;
  }> {
    const timestamp = Date.now();
    const email = `test-integration-${timestamp}@bombastic.ltd`;
    const username = `test-integration-${timestamp}`;

    const { userId, password } = await this.createTestUser(email, username);

    return {
      userId,
      email,
      username,
      password,
    };
  }

  async createTestPlaylist(userId: string) {
    const { data } = await this.supabase
      .from('playlists')
      .insert({
        name: 'Test Playlist',
        created_by: userId,
        type: 'Private',
      })
      .select()
      .single();

    return data;
  }

  async cleanupTestData() {
    // Clean up test data based on your schema
    await this.supabase.from('playlists').delete().ilike('name', '%test%');

    // Clean up test users (those with bombastic.ltd emails starting with test-)
    await this.supabase.auth.admin
      .listUsers()
      .then(async ({ data: { users } }) => {
        const testUsers = users.filter(
          (user) =>
            user.email?.includes('@bombastic.ltd') &&
            user.email?.startsWith('test-')
        );

        for (const user of testUsers) {
          await this.supabase.auth.admin.deleteUser(user.id);
        }
      });
  }
}
