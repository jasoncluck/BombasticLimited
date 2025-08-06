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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for TestDataManager');
    }

    this.supabase = createClient<Database>(supabaseUrl, serviceRoleKey);
  }

  /**
   * Creates a unique test user for a specific worker
   */
  async createTestUser(workerId: number): Promise<TestUser> {
    const timestamp = Date.now();
    const email = `test-user-worker-${workerId}-${timestamp}@example.com`;
    const password = 'TestPassword123!';
    const username = `testuser${workerId}${timestamp}`;

    // Create user with admin client
    const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username
      }
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create test user: ${authError?.message}`);
    }

    // Create profile record
    const { error: profileError } = await this.supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        username,
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      // Clean up auth user if profile creation fails
      await this.supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    const testUser: TestUser = {
      id: authData.user.id,
      email,
      password,
      username
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
        const { data } = await this.supabase.auth.admin.getUserById(existing.id);
        if (data.user) {
          return existing;
        }
      } catch (error) {
        console.warn(`Test user ${existing.id} no longer exists, creating new one`);
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
      password: testUser.password
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
    const deletePromises = Array.from(this.testUsers.values()).map(async (testUser) => {
      try {
        // Delete user profile first
        await this.supabase
          .from('profiles')
          .delete()
          .eq('id', testUser.id);

        // Delete auth user
        await this.supabase.auth.admin.deleteUser(testUser.id);
      } catch (error) {
        console.warn(`Failed to clean up test user ${testUser.id}:`, error);
      }
    });

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
      // Delete user profile first
      await this.supabase
        .from('profiles')
        .delete()
        .eq('id', testUser.id);

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
        type: 'user' as Database['public']['Enums']['playlist_type']
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
        sort_order: 'asc' as Database['public']['Enums']['playlist_sort_order'],
        sorted_by: 'position' as Database['public']['Enums']['playlist_sorted_by']
      });

    if (userPlaylistError) {
      // Clean up playlist if user_playlists creation fails
      await this.supabase.from('playlists').delete().eq('id', data.id);
      throw new Error(`Failed to create user playlist association: ${userPlaylistError.message}`);
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
        const playlistIds = userPlaylists.map(p => p.id);
        
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
        await this.supabase
          .from('playlists')
          .delete()
          .eq('created_by', userId);
      }

      // Add other cleanup operations as needed
    } catch (error) {
      console.warn(`Failed to clean up test data for user ${userId}:`, error);
    }
  }
}