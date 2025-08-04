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
    thumbnail_maxres_url: 'https://example.com/thumb_maxres.jpg',
    published_at: '2023-01-01T00:00:00Z',
    duration: '00:30:00',
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
    sources: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
    content_display: 'TILES',
    content_description: 'FULL',
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
