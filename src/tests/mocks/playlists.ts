import type { UserPlaylist } from "$lib/supabase/playlists";

export const mockPlaylist: UserPlaylist = {
  id: 1,
  name: "Test Playlist",
  description: "Test Description",
  created_by: "test-user",
  created_at: "2025-01-01T00:00:00Z",
  short_id: "test-123",
  type: "Private",
  profile_username: "testuser",
  youtube_id: null,
  thumbnail_url: null,
  thumbnail_maxres_url: null,
  image_properties: null,
  playlist_position: null,
  sort_order: "ascending",
  sorted_by: "title",
};

export const createMockPlaylist = (
  overrides: Partial<UserPlaylist> = {},
): UserPlaylist => ({
  ...mockPlaylist,
  ...overrides,
});
