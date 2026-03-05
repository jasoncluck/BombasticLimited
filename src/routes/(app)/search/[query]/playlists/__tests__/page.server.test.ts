import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from '../+page.server';
import { searchPlaylists } from '$lib/supabase/playlists';

// Mock the dependencies
vi.mock('$lib/supabase/playlists', () => ({
  searchPlaylists: vi.fn(),
  DEFAULT_NUM_PLAYLISTS_PAGINATION: 30,
}));

vi.mock('$lib/server/image-processing', () => ({
  generatePlaylistImageUrl: vi.fn(),
}));

vi.mock('$lib/components/playlist/playlist', () => ({
  parseImageProperties: vi
    .fn()
    .mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
}));

const mockSearchPlaylists = vi.mocked(searchPlaylists);

describe('Search Playlists Page Server Load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate playlist image URLs for caching', async () => {
    const mockPlaylist = {
      id: 1,
      name: 'Test Playlist',
      thumbnail_url: 'https://example.com/thumb.jpg',
      image_properties: { x: 0, y: 0, width: 100, height: 100 },
      type: 'Public' as const,
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'user-id',
      deleted_at: null,
      description: 'Test description',
      search_vector: null,
      short_id: 'test-id',
      youtube_id: null,
      profile_username: 'testuser',
      // Add missing required properties
      image_url: 'https://example.com/playlist_image.jpg',
      image_processing_status: 'completed' as const,
      duration_seconds: 1800,
    };

    mockSearchPlaylists.mockResolvedValue({
      playlists: [mockPlaylist],
      count: 1,
      error: null,
    });

    const result = await load({
      depends: vi.fn(),
      params: { query: 'test' },
      url: new URL('http://localhost/search/test/playlists'),
      locals: { supabase: {} as any, session: null },
      parent: vi.fn().mockResolvedValue({
        preferredImageFormat: 'avif',
      }),
      request: new Request('http://localhost/search/test/playlists'),
    } as any);

    expect(result?.playlistResults).toHaveLength(1);
    expect(result?.playlistResults?.[0]).toMatchObject({
      ...mockPlaylist,
      // processedImageUrl is no longer generated since playlist-image API doesn't exist
    });
  });
});
