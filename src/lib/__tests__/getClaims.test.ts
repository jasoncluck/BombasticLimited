// Simple test to check getClaims availability
import { describe, it, expect, vi } from 'vitest';

const mockSupabaseClient = {
  auth: {
    getClaims: vi.fn(),
    getUser: vi.fn(),
    getSession: vi.fn(),
  },
};

describe('Supabase auth getClaims', () => {
  it('should test getClaims functionality', async () => {
    // Mock getClaims response based on Supabase docs
    const mockClaims = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    mockSupabaseClient.auth.getClaims.mockResolvedValue({
      data: { claims: mockClaims },
      error: null,
    });

    const { data, error } = await mockSupabaseClient.auth.getClaims();

    expect(error).toBeNull();
    expect(data.claims).toEqual(mockClaims);
    expect(data.claims.sub).toBe('user-123');
  });
});
