import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/db', () => ({
  pool: { query: queryMock },
}));

const { checkIfUsernameIsUnique, getProfileById } =
  await import('../user-profiles');

describe('user-profiles', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  describe('checkIfUsernameIsUnique', () => {
    it('should return true for unique username', async () => {
      queryMock.mockResolvedValue({
        rows: [{ is_unique_username: true }],
      });

      const result = await checkIfUsernameIsUnique({ username: 'uniqueuser' });

      expect(queryMock).toHaveBeenCalledWith(
        'SELECT is_unique_username($1) AS is_unique_username',
        ['uniqueuser']
      );
      expect(result).toBe(true);
    });

    it('should return false for non-unique username', async () => {
      queryMock.mockResolvedValue({
        rows: [{ is_unique_username: false }],
      });

      const result = await checkIfUsernameIsUnique({
        username: 'existinguser',
      });

      expect(result).toBe(false);
    });

    it('should return false when no row is returned', async () => {
      queryMock.mockResolvedValue({ rows: [] });

      const result = await checkIfUsernameIsUnique({ username: 'testuser' });

      expect(result).toBe(false);
    });
  });

  describe('getProfileById', () => {
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

      queryMock.mockResolvedValue({ rows: [mockProfile] });

      const result = await getProfileById({ userId: 'user123' });

      expect(queryMock).toHaveBeenCalledWith(
        'SELECT * FROM profiles WHERE id = $1',
        ['user123']
      );
      expect(result.profile).toEqual(mockProfile);
      expect(result.error).toBeUndefined();
    });

    it('should return null profile for null userId', async () => {
      const result = await getProfileById({ userId: null });

      expect(queryMock).not.toHaveBeenCalled();
      expect(result.profile).toBeNull();
    });

    it('should handle profile fetch errors', async () => {
      const dbError = new Error('Profile not found');
      queryMock.mockRejectedValue(dbError);

      const result = await getProfileById({ userId: 'user123' });

      expect(result.profile).toBeNull();
      expect(result.error).toBe(dbError);
    });
  });
});
