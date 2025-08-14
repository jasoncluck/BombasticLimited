import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from '../+page.server';
import { searchPlaylists } from '$lib/supabase/playlists';
import { generatePlaylistImageUrl } from '$lib/server/image-processing';

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
const mockGeneratePlaylistImageUrl = vi.mocked(generatePlaylistImageUrl);

describe('Search Playlists Page Server Load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate playlist image URLs for caching', async () => {
    const mockPlaylist = {
      id: 1,
      name: 'Test Playlist',
      thumbnail_url: 'https://example.com/thumb.jpg',
      thumbnail_maxres_url: 'https://example.com/maxres.jpg',
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
    };

    mockSearchPlaylists.mockResolvedValue({
      playlists: [mockPlaylist],
      count: 1,
      error: null,
    });

    mockGeneratePlaylistImageUrl.mockReturnValue(
      '/api/playlist-image?url=https%3A%2F%2Fexample.com%2Fthumb.jpg&maxresUrl=https%3A%2F%2Fexample.com%2Fmaxres.jpg&format=auto&quality=90&type=image&imageProperties=%7B%22x%22%3A0%2C%22y%22%3A0%2C%22width%22%3A100%2C%22height%22%3A100%7D'
    );

    const result = await load({
      depends: vi.fn(),
      params: { query: 'test' },
      url: new URL('http://localhost/search/test/playlists'),
      locals: { supabase: {} as any, session: null },
      request: new Request('http://localhost/search/test/playlists'),
    } as any);

    expect(mockGeneratePlaylistImageUrl).toHaveBeenCalledWith({
      imageProperties: expect.any(Object),
      thumbnailMaxResUrl: 'https://example.com/maxres.jpg',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      format: 'auto',
      quality: 90,
    });

    expect(result?.playlistResults).toHaveLength(1);
    expect(result?.playlistResults?.[0]).toMatchObject({
      ...mockPlaylist,
      processedImageUrl:
        '/api/playlist-image?url=https%3A%2F%2Fexample.com%2Fthumb.jpg&maxresUrl=https%3A%2F%2Fexample.com%2Fmaxres.jpg&format=auto&quality=90&type=image&imageProperties=%7B%22x%22%3A0%2C%22y%22%3A0%2C%22width%22%3A100%2C%22height%22%3A100%7D',
    });
  });
});
