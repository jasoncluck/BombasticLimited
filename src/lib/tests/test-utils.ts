import { vi } from 'vitest';
import type { Video, VideoWithTimestamp } from '$lib/supabase/videos';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '$lib/supabase/user-profiles';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Mock Video data factory
 */
export function createMockVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    title: 'Test Video',
    description: 'Test video description',
    source: 'giantbomb',
    thumbnail_url: 'https://example.com/thumb.jpg',
    image_url: 'https://example.com/video_image.jpg', // Add missing image_url
    published_at: '2023-01-01T00:00:00Z',
    duration: '00:30:00',
    views: 0,
    ...overrides,
  };
}

/**
 * Mock VideoWithTimestamp data factory
 */
export function createMockVideoWithTimestamp(
  overrides: Partial<VideoWithTimestamp> = {}
): VideoWithTimestamp {
  return {
    ...createMockVideo(overrides),
    video_start_seconds: 0,
    updated_at: '2023-01-01T00:00:00Z',
    watched_at: '2023-01-01T00:00:00Z',
    playlist_name: null,
    playlist_short_id: null,
    playlist_sorted_by: undefined,
    playlist_sort_order: undefined,
    ...overrides,
  };
}

/**
 * Mock Session data factory
 */
export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@example.com',
      email_confirmed_at: '2023-01-01T00:00:00Z',
      phone: '',
      confirmed_at: '2023-01-01T00:00:00Z',
      last_sign_in_at: '2023-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      is_anonymous: false,
    },
    ...overrides,
  };
}

/**
 * Mock UserProfile data factory
 */
export function createMockUserProfile(
  overrides: Partial<UserProfile> = {}
): UserProfile {
  return {
    id: 'user-1',
    username: 'testuser',
    avatar_url: null,
    providers: ['email'],
    sources: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
    username_history: {},

    content_display: 'TILES',
    content_description: 'FULL',
    account_type: 'default',
    ...overrides,
  };
}

/**
 * Mock successful video response
 */
export function createMockVideoResponse(
  videos: Video[] = [],
  count: number | null = null
) {
  return {
    videos,
    count: count ?? videos.length,
    error: null as PostgrestError | null,
  };
}

/**
 * Mock successful continue watching response
 */
export function createMockContinueWatchingResponse(
  videos: VideoWithTimestamp[] = [],
  count: number | null = null
) {
  return {
    videos,
    count: count ?? videos.length,
    error: null as PostgrestError | null,
  };
}

/**
 * Mock error response
 */
export function createMockErrorResponse(message: string = 'Test error') {
  return {
    videos: [],
    count: null,
    error: {
      message,
      details: '',
      hint: '',
      code: '500',
    } as PostgrestError,
  };
}

/**
 * Mock source videos for all sources
 */
export function createMockSourceVideos() {
  return {
    giantbomb: [
      createMockVideo({ id: 'gb1', title: 'GB Video 1', source: 'giantbomb' }),
    ],
    jeffgerstmann: [
      createMockVideo({
        id: 'jg1',
        title: 'JG Video 1',
        source: 'jeffgerstmann',
      }),
    ],
    nextlander: [
      createMockVideo({ id: 'nl1', title: 'NL Video 1', source: 'nextlander' }),
    ],
    remap: [
      createMockVideo({ id: 'rm1', title: 'Remap Video 1', source: 'remap' }),
    ],
  };
}

/**
 * Mock continue watching videos
 */
export function createMockContinueVideos() {
  return [
    createMockVideoWithTimestamp({
      id: 'cv1',
      title: 'Continue Video 1',
      video_start_seconds: 300,
    }),
  ];
}

/**
 * Mock successful profile response
 */
export function createMockProfileResponse(profile: UserProfile | null = null) {
  return {
    profile: profile || createMockUserProfile(),
    error: null as any,
  };
}

/**
 * Mock PlaylistVideoWithTimestamp data factory
 */
export function createMockPlaylistVideoWithTimestamp(
  overrides: Partial<any> = {}
) {
  return {
    id: 'video-1',
    video_position: 1,
    source: 'giantbomb' as const,
    title: 'Test Video in Playlist',
    description: 'Test video description',
    thumbnail_url: 'https://example.com/thumb.jpg',
    image_url: 'https://example.com/video_image.jpg',
    published_at: '2023-01-01T00:00:00Z',
    duration: '00:30:00',
    video_start_seconds: 0,
    updated_at: '2023-01-01T00:00:00Z',
    watched_at: '2023-01-01T00:00:00Z',
    // Video properties for compatibility
    views: 0,
    ...overrides,
  };
}

/**
 * Mock Playlist data factory
 */
export function createMockPlaylist(overrides: Partial<any> = {}) {
  return {
    id: 1,
    short_id: 'abc123',
    name: 'Test Playlist',
    youtube_id: 'youtube123',
    thumbnail_url: 'https://example.com/playlist_image.jpg',
    image_processing_status: 'completed' as const,
    image_processing_updated_at: '2023-01-01T00:00:00Z',
    image_properties: { x: 0, y: 0, width: 100, height: 100 },
    created_at: '2023-01-01T00:00:00Z',
    type: 'Public' as const,
    created_by: 'mock-user-id',
    description: 'Mock playlist description',
    profile_username: 'testuser',
    deleted_at: null,
    // Add missing required properties
    image_url: 'https://example.com/playlist_image.jpg',
    thumbnail_video_id: 'video-1',
    duration_seconds: 1800,
    image_avif_url: 'https://example.com/playlist_image.avif',
    image_jpg_url: 'https://example.com/playlist_image.jpg',
    image_webp_url: 'https://example.com/playlist_image.webp',
    updated_at: '2023-01-01T00:00:00Z',
    // Add UserPlaylist properties
    playlist_position: 1,
    sorted_by: 'playlistOrder',
    sort_order: 'ascending',
    added_at: '2023-01-01T00:00:00Z',
    avatar_url: null,
    ...overrides,
  };
}

/**
 * Create mock playlist data response
 */
export function createMockPlaylistDataResponse(
  playlist: any | null = null,
  videos: any[] = [],
  videosCount: number = 0
) {
  return {
    playlist,
    videos,
    videosCount,
    playlistDuration: { hours: 0, minutes: 30, seconds: 0 },
    error: null,
  };
}

/**
 * Create mock playlists response
 */
export function createMockPlaylistsResponse(
  playlists: any[] = [],
  count: number = 0
) {
  return {
    playlists,
    count,
    error: null,
  };
}

/**
 * Create mock SuperValidated response
 */
export function createMockSuperValidated(
  data: any = {},
  valid: boolean = true
) {
  return {
    id: 'mock-form-id',
    data,
    valid,
    posted: false,
    errors: {},
  };
}

/**
 * Mock Supabase client for testing
 */
export function createMockSupabaseClient() {
  return {
    auth: {
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
        limit: vi.fn(),
        order: vi.fn(),
      })),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    })),
  };
}
