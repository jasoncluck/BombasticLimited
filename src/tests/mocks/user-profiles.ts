import type { UserProfile } from "$lib/supabase/user-profiles";

export const mockUserProfile: UserProfile = {
  id: "test-user-id",
  username: "testuser",
  sources: ["giantbomb", "nextlander"],
  content_description: "FULL",
  content_display: "TILES",
};

export const createMockUserProfile = (
  overrides: Partial<UserProfile> = {},
): UserProfile => ({
  ...mockUserProfile,
  ...overrides,
});
