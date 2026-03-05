import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleUpdateProfileContentDisplay,
  getUserInitials,
} from '../profile-service';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';

// Mock modules
vi.mock('$lib/supabase/user-profiles', () => ({
  updateProfileContentDisplay: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  invalidateAll: vi.fn(),
}));

describe('profile service module', () => {
  let mockSupabase: SupabaseClient<Database>;
  let mockSession: Session;

  beforeEach(() => {
    mockSupabase = {} as any;
    mockSession = { user: { id: 'user123' } } as any;
    vi.clearAllMocks();
  });

  describe('handleUpdateProfileContentDisplay', () => {
    it('should update profile content display and invalidate cache', async () => {
      const { updateProfileContentDisplay } = await import(
        '$lib/supabase/user-profiles'
      );
      const { invalidateAll } = await import('$app/navigation');

      await handleUpdateProfileContentDisplay({
        contentDisplay: 'TILES',
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(updateProfileContentDisplay).toHaveBeenCalledWith({
        contentDisplay: 'TILES',
        supabase: mockSupabase,
        session: mockSession,
      });
      expect(invalidateAll).toHaveBeenCalled();
    });

    it('should handle null session', async () => {
      const { updateProfileContentDisplay } = await import(
        '$lib/supabase/user-profiles'
      );
      const { invalidateAll } = await import('$app/navigation');

      await handleUpdateProfileContentDisplay({
        contentDisplay: 'TABLE',
        supabase: mockSupabase,
        session: null,
      });

      expect(updateProfileContentDisplay).toHaveBeenCalledWith({
        contentDisplay: 'TABLE',
        supabase: mockSupabase,
        session: null,
      });
      expect(invalidateAll).toHaveBeenCalled();
    });
  });

  describe('getUserInitials', () => {
    it('should return ?? for null username', () => {
      const result = getUserInitials(null);
      expect(result).toBe('??');
    });

    it('should return ?? for empty username', () => {
      const result = getUserInitials('');
      expect(result).toBe('??');
    });

    it('should return ?? for username with only special characters', () => {
      const result = getUserInitials('@#$%');
      expect(result).toBe('??');
    });

    it('should return single character uppercase for single character username', () => {
      const result = getUserInitials('a');
      expect(result).toBe('A');
    });

    it('should return first two characters for simple usernames', () => {
      const result = getUserInitials('john');
      expect(result).toBe('JO');
    });

    it('should prioritize vowels over uppercase when vowel is at position 1', () => {
      const result = getUserInitials('johnDoe');
      expect(result).toBe('JO'); // 'o' is a vowel at position 1, so it's preferred over 'D'
    });

    it('should prioritize vowels for better readability', () => {
      const result = getUserInitials('jane');
      expect(result).toBe('JA');
    });

    it('should handle usernames with prefixes', () => {
      const result = getUserInitials('@username');
      expect(result).toBe('US');
    });

    it('should handle usernames with hash prefixes', () => {
      const result = getUserInitials('#developer');
      expect(result).toBe('DE');
    });

    it('should remove special characters and prioritize vowels at position 1', () => {
      const result = getUserInitials('user-123');
      expect(result).toBe('US'); // Removes -, keeps 'user123', 's' is not a vowel so uses 's'
    });

    it('should handle mixed case and prioritize vowels at position 1', () => {
      const result = getUserInitials('John@Doe');
      expect(result).toBe('JO'); // Removes @, becomes 'JohnDoe', 'o' is vowel at position 1
    });

    it('should handle usernames starting with numbers', () => {
      const result = getUserInitials('123user');
      expect(result).toBe('12'); // Uses first two characters when no vowels or uppercase
    });

    it('should handle complex usernames with multiple uppercase letters', () => {
      const result = getUserInitials('theQuickBrownFox');
      expect(result).toBe('TQ');
    });

    it('should handle usernames with underscores and dashes', () => {
      const result = getUserInitials('test_user_name');
      expect(result).toBe('TE'); // Removes _, becomes 'testusername', 'e' is vowel at position 1
    });

    it('should handle very short usernames after cleaning', () => {
      const result = getUserInitials('@a');
      expect(result).toBe('A');
    });

    it('should prefer uppercase over vowels when both are available', () => {
      const result = getUserInitials('maryAnn');
      expect(result).toBe('MA');
    });

    it('should handle usernames with only numbers', () => {
      const result = getUserInitials('123456');
      expect(result).toBe('12');
    });

    it('should handle usernames with mixed alphanumeric', () => {
      const result = getUserInitials('user2024');
      expect(result).toBe('US'); // 's' is not vowel, uses second character 's'
    });

    it('should handle usernames with consonants only', () => {
      const result = getUserInitials('xyz');
      expect(result).toBe('XY');
    });

    it('should handle usernames with vowels in second position', () => {
      const result = getUserInitials('joe');
      expect(result).toBe('JO');
    });

    it('should handle long usernames with early uppercase', () => {
      const result = getUserInitials('superUserName');
      expect(result).toBe('SU');
    });
  });
});
