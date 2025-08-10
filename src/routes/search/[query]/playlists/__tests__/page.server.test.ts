import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from '../+page.server';
import { searchPlaylists } from '$lib/supabase/playlists';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

// Mock the dependencies
vi.mock('$lib/supabase/playlists', () => ({
  searchPlaylists: vi.fn(),
  DEFAULT_NUM_PLAYLISTS_PAGINATION: 30,
}));

vi.mock('$lib/server/image-processing', () => ({
  getCroppedPlaylistImageUrlServer: vi.fn(),
}));

vi.mock('$lib/components/playlist/playlist', () => ({
  parseImageProperties: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
}));

const mockSearchPlaylists = vi.mocked(searchPlaylists);
const mockGetCroppedPlaylistImageUrlServer = vi.mocked(getCroppedPlaylistImageUrlServer);

describe('Search Playlists Page Server Load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process playlist images server-side with Accept header', async () => {
    const mockPlaylist = {
      id: 1,
      name: 'Test Playlist',
      thumbnail_url: 'https://example.com/thumb.jpg',
      thumbnail_maxres_url: 'https://example.com/maxres.jpg',
      image_properties: { x: 0, y: 0, width: 100, height: 100 },
      type: 'Public' as const,
      created_at: '2023-01-01T00:00:00Z',
      created_by: 'user-id',
      deleted_at: null,
      description: 'Test description',
      search_vector: null,
      short_id: 'test-short-id',
      youtube_id: null,
      profile_username: 'testuser',
    };

    mockSearchPlaylists.mockResolvedValue({
      playlists: [mockPlaylist],
      count: 1,
      error: null,
    });

    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue('processed-image-url');

    const result = await load({
      depends: vi.fn(),
      params: { query: 'test' },
      url: new URL('http://localhost/search/test/playlists'),
      locals: { supabase: {} as any, session: null },
      request: new Request('http://localhost/search/test/playlists', {
        headers: { accept: 'image/avif,image/webp,image/*' },
      }),
    } as any);

    expect(mockGetCroppedPlaylistImageUrlServer).toHaveBeenCalledWith({
      imageProperties: expect.any(Object),
      thumbnailMaxResUrl: 'https://example.com/maxres.jpg',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      acceptHeader: 'image/avif,image/webp,image/*',
      options: { format: 'auto' },
    });

    expect(result?.playlistResults).toHaveLength(1);
    expect(result?.playlistResults?.[0]).toMatchObject({
      ...mockPlaylist,
      processedImageUrl: 'processed-image-url',
    });
  });
});