import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/lib/supabase/database.types';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  username: string;
}

export class TestDataManager {
  private supabase: SupabaseClient<Database>;
  private testUsers: Map<number, TestUser> = new Map();

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required for TestDataManager'
      );
    }

    this.supabase = createClient<Database>(supabaseUrl, serviceRoleKey);
  }

  /**
   * Creates a unique test user for a specific worker
   */
  async createTestUser(workerId: number): Promise<TestUser> {
    // Use a predictable pattern for test users that can be reused
    const email = `test-user-worker-${workerId}@example.com`;
    const password = 'TestPassword123!';
    const username = `testuserworker${workerId}`;

    // First, try to find if this user already exists
    const { data: existingUsers } = await this.supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000, // Get all users to search
    });

    const existingUser = existingUsers.users?.find(
      (user) => user.email === email
    );

    if (existingUser) {
      console.log(`Reusing existing test user: ${email}`);
      const testUser: TestUser = {
        id: existingUser.id,
        email,
        password,
        username,
      };
      this.testUsers.set(workerId, testUser);
      return testUser;
    }

    // Create user with admin client only if it doesn't exist
    console.log(`Creating new test user: ${email}`);
    const { data: authData, error: authError } =
      await this.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
        },
      });

    if (authError || !authData.user) {
      throw new Error(`Failed to create test user: ${authError?.message}`);
    }

    const testUser: TestUser = {
      id: authData.user.id,
      email,
      password,
      username,
    };

    this.testUsers.set(workerId, testUser);
    return testUser;
  }

  /**
   * Gets or creates a test user for a worker
   */
  async getOrCreateTestUser(workerId: number): Promise<TestUser> {
    const existing = this.testUsers.get(workerId);
    if (existing) {
      // Verify user still exists in database
      try {
        const { data } = await this.supabase.auth.admin.getUserById(
          existing.id
        );
        if (data.user) {
          return existing;
        }
      } catch {
        console.warn(
          `Test user ${existing.id} no longer exists, creating new one`
        );
      }
    }

    return await this.createTestUser(workerId);
  }

  /**
   * Authenticates a test user and returns session info
   */
  async authenticateTestUser(testUser: TestUser) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: testUser.email,
      password: testUser.password,
    });

    if (error) {
      throw new Error(`Failed to authenticate test user: ${error.message}`);
    }

    return data;
  }

  /**
   * Cleans up test users for all workers
   */
  async cleanupAllTestUsers(): Promise<void> {
    const deletePromises = Array.from(this.testUsers.values()).map(
      async (testUser) => {
        try {
          // Delete auth user
          await this.supabase.auth.admin.deleteUser(testUser.id);
        } catch (error) {
          console.warn(`Failed to clean up test user ${testUser.id}:`, error);
        }
      }
    );

    await Promise.allSettled(deletePromises);
    this.testUsers.clear();
  }

  /**
   * Cleans up test user for specific worker
   */
  async cleanupTestUser(workerId: number): Promise<void> {
    const testUser = this.testUsers.get(workerId);
    if (!testUser) return;

    try {
      // Delete auth user
      await this.supabase.auth.admin.deleteUser(testUser.id);

      this.testUsers.delete(workerId);
    } catch (error) {
      console.warn(`Failed to clean up test user ${testUser.id}:`, error);
    }
  }

  /**
   * Creates test playlists for a user
   */
  async createTestPlaylist(userId: string, name: string = 'Test Playlist') {
    const shortId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const { data, error } = await this.supabase
      .from('playlists')
      .insert({
        created_by: userId,
        name,
        short_id: shortId,
        description: 'Test playlist for e2e testing',
        type: 'Private' as Database['public']['Enums']['playlist_type'],
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test playlist: ${error.message}`);
    }

    // Also create user_playlists entry to associate it with the user
    const { error: userPlaylistError } = await this.supabase
      .from('user_playlists')
      .insert({
        id: data.id,
        user_id: userId,
        playlist_position: 0,
        sort_order:
          'ascending' as Database['public']['Enums']['playlist_sort_order'],
        sorted_by:
          'playlistOrder' as Database['public']['Enums']['playlist_sorted_by'],
      });

    if (userPlaylistError) {
      // Clean up playlist if user_playlists creation fails
      await this.supabase.from('playlists').delete().eq('id', data.id);
      throw new Error(
        `Failed to create user playlist association: ${userPlaylistError.message}`
      );
    }

    return data;
  }

  /**
   * Cleans up test data for a user (playlists, etc.)
   */
  async cleanupUserTestData(userId: string): Promise<void> {
    try {
      // Get user playlists first
      const { data: userPlaylists } = await this.supabase
        .from('user_playlists')
        .select('id')
        .eq('user_id', userId);

      if (userPlaylists && userPlaylists.length > 0) {
        const playlistIds = userPlaylists.map((p) => p.id);

        // Clean up playlist videos
        await this.supabase
          .from('playlist_videos')
          .delete()
          .in('playlist_id', playlistIds);

        // Clean up user_playlists associations
        await this.supabase
          .from('user_playlists')
          .delete()
          .eq('user_id', userId);

        // Clean up playlists themselves (only if created by this user)
        await this.supabase.from('playlists').delete().eq('created_by', userId);
      }

      // Add other cleanup operations as needed
    } catch (error) {
      console.warn(`Failed to clean up test data for user ${userId}:`, error);
    }
  }

  /**
   * Force cleanup all test users (use sparingly - breaks user reuse)
   * This is useful for completely resetting the test environment
   */
  async forceCleanupAllTestUsers(): Promise<void> {
    console.log(
      '⚠️  Force cleaning up all test users - this will break user reuse'
    );

    // Clean up users from memory
    const deletePromises = Array.from(this.testUsers.values()).map(
      async (testUser) => {
        try {
          await this.supabase.auth.admin.deleteUser(testUser.id);
          console.log(`Deleted test user: ${testUser.email}`);
        } catch (error) {
          console.warn(`Failed to delete test user ${testUser.id}:`, error);
        }
      }
    );

    // Also clean up any users that match our test pattern but aren't in memory
    try {
      const { data: allUsers } = await this.supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      const testUserDeletePromises =
        allUsers.users
          ?.filter((user) => user.email?.startsWith('test-user-worker-'))
          .map(async (user) => {
            try {
              await this.supabase.auth.admin.deleteUser(user.id);
              console.log(`Deleted persistent test user: ${user.email}`);
            } catch (error) {
              console.warn(
                `Failed to delete persistent test user ${user.id}:`,
                error
              );
            }
          }) || [];

      await Promise.allSettled([...deletePromises, ...testUserDeletePromises]);
    } catch (error) {
      console.warn('Failed to list/delete persistent test users:', error);
      await Promise.allSettled(deletePromises);
    }

    this.testUsers.clear();
    console.log('Force cleanup completed');
  }
}
