import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkIfUsernameIsUnique, getUserProfile } from '../user-profiles';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

// Create a simple mock Supabase client
const createMockSupabaseClient = () => {
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();
  const mockAuthGetClaims = vi.fn();

  return {
    rpc: mockRpc,
    from: mockFrom,
    auth: {
      getClaims: mockAuthGetClaims,
    },
    mockRpc,
    mockFrom,
    mockAuthGetClaims,
  } as unknown as SupabaseClient<Database> & {
    mockRpc: typeof mockRpc;
    mockFrom: typeof mockFrom;
    mockAuthGetClaims: typeof mockAuthGetClaims;
  };
};

describe('user-profiles', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
  });

  describe('checkIfUsernameIsUnique', () => {
    it('should return true for unique username', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: true, error: null });

      const result = await checkIfUsernameIsUnique({
        username: 'uniqueuser',
        supabase: mockSupabase,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('is_unique_username', {
        p_username: 'uniqueuser',
      });
      expect(result).toBe(true);
    });

    it('should return false for non-unique username', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: false, error: null });

      const result = await checkIfUsernameIsUnique({
        username: 'existinguser',
        supabase: mockSupabase,
      });

      expect(result).toBe(false);
    });

    it('should return false when RPC returns null', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: null, error: null });

      const result = await checkIfUsernameIsUnique({
        username: 'testuser',
        supabase: mockSupabase,
      });

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: '500' },
      });

      const result = await checkIfUsernameIsUnique({
        username: 'testuser',
        supabase: mockSupabase,
      });

      expect(result).toBe(false);
    });
  });

  describe('getUserProfile', () => {
    it('should get user profile successfully', async () => {
      const mockProfile = {
        id: 'user123',
        username: 'testuser',
        avatar_url: 'https://example.com/avatar.jpg',
        account_type: 'default',
        content_description: 'FULL',
        content_display: 'TABLE',
        providers: ['email'],
        sources: ['giantbomb'],
        username_history: [],
      };

      mockSupabase.mockAuthGetClaims.mockResolvedValue({
        data: { claims: { sub: 'user123' } },
        error: null,
      });

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockProfile,
          error: null,
        }),
      };

      mockSupabase.mockFrom.mockReturnValue(mockChain);

      const result = await getUserProfile({
        supabase: mockSupabase,
      });

      expect(mockSupabase.auth.getClaims).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'user123');
      expect(result.profile).toEqual(mockProfile);
      expect(result.error).toBeNull();
    });

    it('should handle missing auth claims', async () => {
      mockSupabase.mockAuthGetClaims.mockResolvedValue({
        data: { claims: null },
        error: null,
      });

      const result = await getUserProfile({
        supabase: mockSupabase,
      });

      expect(result.profile).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should handle auth claims error', async () => {
      const authError = { message: 'Auth failed', code: '401' };
      mockSupabase.mockAuthGetClaims.mockResolvedValue({
        data: null,
        error: authError,
      });

      const result = await getUserProfile({
        supabase: mockSupabase,
      });

      expect(result.profile).toBeNull();
      expect(result.error).toBe(authError);
    });

    it('should handle profile fetch errors', async () => {
      mockSupabase.mockAuthGetClaims.mockResolvedValue({
        data: { claims: { sub: 'user123' } },
        error: null,
      });

      const dbError = { message: 'Profile not found', code: '404' };
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: dbError,
        }),
      };

      mockSupabase.mockFrom.mockReturnValue(mockChain);

      const result = await getUserProfile({
        supabase: mockSupabase,
      });

      expect(result.profile).toBeNull();
      expect(result.error).toBe(dbError);
    });
  });
});
