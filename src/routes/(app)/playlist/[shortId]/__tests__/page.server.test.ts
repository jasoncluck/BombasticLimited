import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { load, actions } from '../+page.server';
import {
  getPlaylistData,
  isUserPlaylist,
  updatePlaylistInfo,
  updatePlaylistThumbnail,
} from '$lib/supabase/playlists';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import {
  getCroppedPlaylistImageUrlServer,
  generatePlaylistImageUrl,
} from '$lib/server/image-processing';
import { getUserProfile, getProfileById } from '$lib/supabase/user-profiles';
import { redirect as flashRedirect } from 'sveltekit-flash-message/server';
import {
  createMockPlaylist,
  createMockSession,
  createMockSuperValidated,
} from '$lib/tests/test-utils';

// Mock dependencies
vi.mock('@sveltejs/kit', () => ({
  redirect: vi.fn(() => {
    throw new Error('Redirect');
  }),
}));

vi.mock('sveltekit-superforms', () => ({
  fail: vi.fn(),
  superValidate: vi.fn(),
}));

vi.mock('sveltekit-superforms/adapters', () => ({
  zod: vi.fn(),
}));

vi.mock('$lib/supabase/playlists', () => ({
  getPlaylistData: vi.fn(),
  isUserPlaylist: vi.fn(),
  updatePlaylistInfo: vi.fn(),
  updatePlaylistThumbnail: vi.fn(),
  parseImageProperties: vi.fn(),
  PLAYLIST_TYPES: ['Public', 'Private'],
  DEFAULT_NUM_VIDEOS_PAGINATION: 20,
}));

vi.mock('$lib/components/pagination/pagination', () => ({
  getPaginationQueryParams: vi.fn(),
}));

vi.mock('$lib/components/playlist/playlist', () => ({
  parseImageProperties: vi.fn(),
}));

vi.mock('$lib/server/image-processing', () => ({
  getCroppedPlaylistImageUrlServer: vi.fn(),
  generatePlaylistImageUrl: vi.fn(),
}));

vi.mock('sveltekit-flash-message/server', () => ({
  redirect: vi.fn(() => {
    throw new Error('Flash Redirect');
  }),
  setFlash: vi.fn(),
}));

vi.mock('bad-words', () => ({
  Filter: vi.fn(() => ({
    isProfane: vi.fn(() => false),
  })),
}));

vi.mock('$lib/supabase/user-profiles', () => ({
  getUserProfile: vi.fn(),
  getProfileById: vi.fn(),
}));

const mockFlashRedirect = vi.mocked(flashRedirect);
const mockFail = vi.mocked(fail);
const mockSuperValidate = vi.mocked(superValidate);
const mockZod = vi.mocked(zod);
const mockGetPlaylistData = vi.mocked(getPlaylistData);
const mockIsUserPlaylist = vi.mocked(isUserPlaylist);
const mockUpdatePlaylistInfo = vi.mocked(updatePlaylistInfo);
const mockUpdatePlaylistThumbnail = vi.mocked(updatePlaylistThumbnail);
const mockGetPaginationQueryParams = vi.mocked(getPaginationQueryParams);
const mockParseImageProperties = vi.mocked(parseImageProperties);
const mockGetCroppedPlaylistImageUrlServer = vi.mocked(
  getCroppedPlaylistImageUrlServer
);
const mockGeneratePlaylistImageUrl = vi.mocked(generatePlaylistImageUrl);
const mockGetUserProfile = vi.mocked(getUserProfile);
const mockGetProfileById = vi.mocked(getProfileById);

describe('playlist/[shortId]/+page.server.ts', () => {
  const mockSupabase = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            sub: 'user-1',
            email: 'test@example.com',
            role: 'authenticated',
          },
        },
        error: null,
      }),
    },
  } as any;
  const mockSession = createMockSession();
  const mockPlaylist = createMockPlaylist();
  const mockVideos: any[] = [];
  const mockPlaylistDuration = { hours: 1, minutes: 30, seconds: 0 };

  const mockLoadEvent: any = {
    locals: {
      supabase: mockSupabase,
      session: mockSession,
    },
    url: new URL('http://localhost:5173/playlist/abc123'),
    params: { shortId: 'abc123' },
    depends: vi.fn(),
    parent: vi.fn(),
    request: {
      headers: {
        get: vi.fn(() => null),
      },
    },
  };

  const mockActionEvent: any = {
    request: {
      formData: vi.fn(),
    },
    locals: {
      supabase: mockSupabase,
      session: mockSession,
    },
    params: {
      shortId: 'abc123',
    },
    cookies: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadEvent.parent.mockResolvedValue({
      contentFilter: {
        type: 'playlist',
        sort: { key: 'playlistOrder', order: 'ascending' },
      },
      preferredImageFormat: 'webp',
    });
    mockGetPaginationQueryParams.mockReturnValue(1);
    mockParseImageProperties.mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue(
      'processed-image-url'
    );
    mockGeneratePlaylistImageUrl.mockReturnValue(
      '/api/playlist-image?url=test'
    );
    mockZod.mockReturnValue({} as any);
    // Mock getUserProfile to return null profile by default
    mockGetUserProfile.mockResolvedValue({
      profile: null,
      error: null,
    });
    // Mock getProfileById to return null profile by default
    mockGetProfileById.mockResolvedValue({
      profile: null,
      error: null,
    });
  });

  describe('load function', () => {
    it('should load playlist data successfully', async () => {
      const mockFormData = createMockSuperValidated(mockPlaylist);
      mockGetPlaylistData.mockResolvedValue({
        playlist: mockPlaylist,
        videos: mockVideos,
        videosCount: 0,
        playlistDuration: mockPlaylistDuration,
        error: null,
      });
      mockSuperValidate.mockResolvedValue(mockFormData);
      mockIsUserPlaylist.mockReturnValue(true);

      const result = await load(mockLoadEvent);

      expect(mockLoadEvent.depends).toHaveBeenCalledWith(
        'supabase:db:videos',
        'supabase:db:playlists'
      );
      expect(mockGetPlaylistData).toHaveBeenCalledWith({
        shortId: 'abc123',
        preferredImageFormat: 'webp',
        contentFilter: {
          type: 'playlist',
          sort: { key: 'playlistOrder', order: 'ascending' },
        },
        currentPage: 1,
        limit: 100,
        supabase: mockSupabase,
      });

      expect(result).toEqual({
        playlist: mockPlaylist,
        videos: mockVideos,
        videosCount: 0,
        contentFilter: {
          type: 'playlist',
          sort: { key: 'playlistOrder', order: 'ascending' },
        },
        creatorProfile: null,
        currentPage: 1,
        playlistDuration: mockPlaylistDuration,
        form: mockFormData,
      });
    });

    it('should redirect when playlist is not found', async () => {
      mockGetPlaylistData.mockResolvedValue({
        playlist: null,
        videos: [],
        videosCount: 0,
        playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
        error: null,
      });

      await expect(load(mockLoadEvent)).rejects.toThrow('Flash Redirect');
      expect(mockFlashRedirect).toHaveBeenCalledWith(302, '/');
    });

    it('should handle user playlist sort preferences', async () => {
      const userPlaylist = {
        ...mockPlaylist,
        sorted_by: 'datePublished',
        sort_order: 'descending',
      };
      const mockFormData = createMockSuperValidated(userPlaylist);

      mockGetPlaylistData.mockResolvedValue({
        playlist: userPlaylist,
        videos: mockVideos,
        videosCount: 0,
        playlistDuration: mockPlaylistDuration,
        error: null,
      });
      mockSuperValidate.mockResolvedValue(mockFormData);
      mockIsUserPlaylist.mockReturnValue(true);

      // No explicit sort in URL
      mockLoadEvent.url = new URL('http://localhost:5173/playlist/abc123');

      const result = await load(mockLoadEvent);

      expect((result as any).contentFilter).toEqual({
        type: 'playlist',
        sort: { key: 'datePublished', order: 'descending' },
      });
    });

    it('should override user playlist sort when explicit sort in URL', async () => {
      const userPlaylist = {
        ...mockPlaylist,
        sorted_by: 'datePublished',
        sort_order: 'descending',
      };
      const mockFormData = createMockSuperValidated(userPlaylist);

      mockGetPlaylistData.mockResolvedValue({
        playlist: userPlaylist,
        videos: mockVideos,
        videosCount: 0,
        playlistDuration: mockPlaylistDuration,
        error: null,
      });
      mockSuperValidate.mockResolvedValue(mockFormData);
      mockIsUserPlaylist.mockReturnValue(true);

      // Explicit sort in URL
      mockLoadEvent.url = new URL(
        'http://localhost:5173/playlist/abc123?sort=title&order=ascending'
      );

      const result = await load(mockLoadEvent);

      expect((result as any).contentFilter).toEqual({
        type: 'playlist',
        sort: { key: 'playlistOrder', order: 'ascending' },
      });
    });

    it('should handle invalid content filter', async () => {
      mockLoadEvent.parent.mockResolvedValue({
        contentFilter: { type: 'invalid' },
        preferredImageFormat: 'webp',
      });

      await expect(load(mockLoadEvent)).rejects.toThrow(
        'Invalid content filter'
      );
    });
  });

  describe('actions.default', () => {
    beforeEach(() => {
      mockActionEvent.request.formData.mockResolvedValue(new FormData());
    });

    it('should redirect when user is not authenticated', async () => {
      const unauthenticatedSupabase = {
        ...mockSupabase,
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not authenticated' },
          }),
        },
      };

      const unauthenticatedEvent = {
        ...mockActionEvent,
        locals: {
          ...mockActionEvent.locals,
          supabase: unauthenticatedSupabase,
        },
      };

      await expect(actions.default(unauthenticatedEvent)).rejects.toThrow(
        'Flash Redirect'
      );
    });

    it('should return fail when form validation fails', async () => {
      const invalidForm = createMockSuperValidated({}, false);
      mockSuperValidate.mockResolvedValue(invalidForm);
      mockFail.mockReturnValue({ form: invalidForm } as any);

      const result = await actions.default(mockActionEvent);

      expect(mockFail).toHaveBeenCalledWith(400, { form: invalidForm });
      expect(result).toEqual({ form: invalidForm });
    });

    it('should successfully update playlist info', async () => {
      const formData = {
        name: 'Updated Playlist',
        description: 'Updated description',
        id: 1,
        type: 'Public',
        isDeletingPlaylistImage: false,
        image_properties: { x: 10, y: 10, width: 200, height: 200 },
      };
      const validFormData = createMockSuperValidated(formData);
      const updatedPlaylist = {
        ...mockPlaylist,
        name: 'Updated Playlist',
        search_vector: null,
      };

      mockSuperValidate.mockResolvedValue(validFormData);
      mockUpdatePlaylistInfo.mockResolvedValue({
        updatedPlaylist: updatedPlaylist as any,
        error: null,
      });

      const result = await actions.default(mockActionEvent);

      expect(mockUpdatePlaylistInfo).toHaveBeenCalledWith({
        playlistId: 1,
        name: 'Updated Playlist',
        description: 'Updated description',
        imageProperties: { x: 10, y: 10, width: 200, height: 200 },
        type: 'Public',
        supabase: mockSupabase,
      });

      expect(result).toEqual({
        form: validFormData,
        success: true,
      });
    });

    it('should handle deleting playlist image', async () => {
      const formData = {
        name: 'Test Playlist',
        description: null,
        id: 1,
        type: 'Private',
        isDeletingPlaylistImage: true,
        image_properties: null,
      };
      const validFormData = createMockSuperValidated(formData);

      mockSuperValidate.mockResolvedValue(validFormData);
      mockUpdatePlaylistInfo.mockResolvedValue({
        updatedPlaylist: { ...mockPlaylist, search_vector: null },
        error: null,
      });

      await actions.default(mockActionEvent);

      expect(mockUpdatePlaylistThumbnail).toHaveBeenCalledWith({
        playlistId: 1,
        imageProperties: null,
        supabase: mockSupabase,
        thumbnailUrl: null,
      });
    });

    it('should handle zero image properties correctly', async () => {
      const formData = {
        name: 'Test Playlist',
        description: null,
        id: 1,
        type: 'Private',
        isDeletingPlaylistImage: false,
        image_properties: { x: 0, y: 0, width: 0, height: 0 },
      };
      const validFormData = createMockSuperValidated(formData);

      mockSuperValidate.mockResolvedValue(validFormData);
      mockUpdatePlaylistInfo.mockResolvedValue({
        updatedPlaylist: { ...mockPlaylist, search_vector: null },
        error: null,
      });

      await actions.default(mockActionEvent);

      expect(mockUpdatePlaylistInfo).toHaveBeenCalledWith({
        playlistId: 1,
        name: 'Test Playlist',
        description: null,
        imageProperties: null, // Should be null when all values are 0
        type: 'Private',
        supabase: mockSupabase,
      });
    });
  });
});
