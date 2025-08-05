import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';
import { load } from '../+page.server';
import { getVideos } from '$lib/supabase/videos';
import { getPlaylistDataByYoutubeId, getPlaylistsForUsername } from '$lib/supabase/playlists';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';
import {
  createMockSession,
  createMockUserProfile,
  createMockVideo,
  createMockVideoResponse,
  createMockPlaylist,
  createMockPlaylistDataResponse,
  createMockPlaylistsResponse,
} from '../../../tests/test-utils';

// Mock dependencies
vi.mock('@sveltejs/kit', () => ({
  redirect: vi.fn(() => {
    throw new Error('Redirect');
  }),
}));
vi.mock('$lib/supabase/videos', () => ({
  getVideos: vi.fn(),
  DEFAULT_NUM_VIDEOS_OVERVIEW: 10,
vi.mock('$lib/supabase/playlists', () => ({
  getPlaylistDataByYoutubeId: vi.fn(),
  getPlaylistsForUsername: vi.fn(),
  DEFAULT_NUM_PLAYLISTS_OVERVIEW: 12,
vi.mock('$lib/server/image-processing', () => ({
  getCroppedPlaylistImageUrlServer: vi.fn(),
vi.mock('$lib/constants/source', () => ({
  isSource: vi.fn((source: string) => ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'].includes(source)),
  SOURCE_INFO: {
    giantbomb: {
      displayName: 'Giant Bomb',
      highlightedPlaylists: [
        { youtubeId: 'playlist1', name: 'Featured Playlist 1' },
        { youtubeId: 'playlist2', name: 'Featured Playlist 2' },
      ],
    },
    jeffgerstmann: {
      displayName: 'Jeff Gerstmann',
      highlightedPlaylists: [],
    nextlander: {
      displayName: 'Nextlander',
        { youtubeId: 'playlist3', name: 'Nextlander Playlist' },
    remap: {
      displayName: 'Remap Radio',
  },
vi.mock('$lib/components/content/content-filter', () => ({
  isVideoFilter: vi.fn(() => true),
vi.mock('$lib/components/playlist/playlist', () => ({
  parseImageProperties: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
const mockGetVideos = vi.mocked(getVideos);
const mockGetPlaylistDataByYoutubeId = vi.mocked(getPlaylistDataByYoutubeId);
const mockGetPlaylistsForUsername = vi.mocked(getPlaylistsForUsername);
const mockGetCroppedPlaylistImageUrlServer = vi.mocked(getCroppedPlaylistImageUrlServer);
const mockRedirect = vi.mocked(redirect);
// Import the mocked functions so we can control them
import { isVideoFilter } from '$lib/components/content/content-filter';
const mockIsVideoFilter = vi.mocked(isVideoFilter);
describe('[source]/+page.server.ts load function', () => {
  const mockSupabase = {} as any;
  const mockSession = createMockSession();
  const mockUserProfile = createMockUserProfile();
  
  const mockVideos = [
    createMockVideo({ id: 'v1', title: 'Video 1', source: 'giantbomb' }),
    createMockVideo({ id: 'v2', title: 'Video 2', source: 'giantbomb' }),
  ];
  const mockPlaylist = createMockPlaylist({
    id: 1,
    short_id: 'abc123',
    name: 'Test Playlist',
    youtube_id: 'playlist1',
    thumbnail_url: 'https://example.com/thumb.jpg',
    thumbnail_maxres_url: 'https://example.com/maxres.jpg',
    image_properties: { x: 0, y: 0, width: 100, height: 100 },
    type: 'Public' as const,
    created_by: mockSession.user.id,
    description: 'Test playlist description',
  });
  const mockSourcePlaylists = [
    createMockPlaylist({
      id: 2,
      short_id: 'def456',
      name: 'Source Playlist 1',
      thumbnail_url: 'https://example.com/thumb1.jpg',
      thumbnail_maxres_url: 'https://example.com/maxres1.jpg',
      image_properties: { x: 0, y: 0, width: 100, height: 100 },
      type: 'Public' as const,
      created_by: mockSession.user.id,
      description: 'Source playlist description',
      youtube_id: 'source_playlist_1',
    }),
  const mockLoadEvent: any = {
    params: { source: 'giantbomb' },
    parent: vi.fn(),
    depends: vi.fn(),
    locals: {
      supabase: mockSupabase,
      session: mockSession,
    setHeaders: vi.fn(),
    isDataRequest: false,
    request: {
      headers: new Map(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to its default behavior
    mockIsVideoFilter.mockReturnValue(true);
    
    mockLoadEvent.parent.mockResolvedValue({
      contentFilter: {
        sort: { key: 'datePublished', order: 'descending' },
        type: 'video',
      },
    });
    // Mock headers.get method
    mockLoadEvent.request.headers = {
      get: vi.fn(() => null),
    };
  describe('source validation', () => {
    it('should load data for valid source', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue({
        playlist: mockPlaylist,
        videosCount: 1,
        playlistDuration: { hours: 0, minutes: 30, seconds: 0 },
        error: null,
        videos: [mockVideos[0]],
      });
      mockGetPlaylistsForUsername.mockResolvedValue({
        playlists: mockSourcePlaylists,
        count: 1,
      mockGetCroppedPlaylistImageUrlServer.mockResolvedValue('https://example.com/processed.jpg');
      const result = await load(mockLoadEvent);
      expect(mockLoadEvent.depends).toHaveBeenCalledWith('supabase:db:videos');
      expect((result as any).source).toBe('giantbomb');
      expect((result as any).videos).toEqual(mockVideos);
    it('should redirect for invalid source', async () => {
      const invalidLoadEvent = {
        ...mockLoadEvent,
        params: { source: 'invalid-source' },
      };
      await expect(load(invalidLoadEvent)).rejects.toThrow('Redirect');
      expect(mockRedirect).toHaveBeenCalledWith(303, '/');
    it('should validate known sources', async () => {
      const validSources = ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'];
      
      for (const source of validSources) {
        const loadEvent = {
          ...mockLoadEvent,
          params: { source },
        };
        mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
        mockGetPlaylistDataByYoutubeId.mockResolvedValue({
          playlist: null,
        videosCount: 0,
        playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
          videos: [],
          videosCount: 0,
          playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
          error: null,
        });
        mockGetPlaylistsForUsername.mockResolvedValue({
          playlists: [],
          count: 0,
        const result = await load(loadEvent);
        expect((result as any).source).toBe(source);
      }
  describe('data fetching', () => {
    beforeEach(() => {
    it('should fetch videos for the source', async () => {
      await load(mockLoadEvent);
      expect(mockGetVideos).toHaveBeenCalledWith({
        source: 'giantbomb',
        limit: 10,
        contentFilter: {
          sort: { key: 'datePublished', order: 'descending' },
          type: 'video',
        },
        supabase: mockSupabase,
    it('should fetch highlighted playlists', async () => {
      expect(mockGetPlaylistDataByYoutubeId).toHaveBeenCalledWith({
        youtubeId: 'playlist1',
          type: 'playlist',
        session: mockSession,
        youtubeId: 'playlist2',
    it('should fetch source playlists', async () => {
      expect(mockGetPlaylistsForUsername).toHaveBeenCalledWith({
        username: 'giantbomb',
        limit: 12,
    it('should process playlist images server-side', async () => {
      expect(mockGetCroppedPlaylistImageUrlServer).toHaveBeenCalledWith({
        imageProperties: { x: 0, y: 0, width: 100, height: 100 },
        thumbnailMaxResUrl: 'https://example.com/maxres1.jpg',
        thumbnailUrl: 'https://example.com/thumb1.jpg',
  describe('highlighted playlists handling', () => {
    it('should handle sources with no highlighted playlists', async () => {
      const jeffGerstmannEvent = {
        params: { source: 'jeffgerstmann' },
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse([], 0)
      );
      const result = await load(jeffGerstmannEvent);
      // Should not call getPlaylistDataByYoutubeId for sources with no highlighted playlists
      expect(mockGetPlaylistDataByYoutubeId).not.toHaveBeenCalled();
      expect((result as any).highlightPlaylists).toEqual([]);
    it('should filter out null playlist results', async () => {
      mockGetPlaylistDataByYoutubeId
        .mockResolvedValueOnce(
          createMockPlaylistDataResponse(mockPlaylist, [mockVideos[0]], 1)
        )
          createMockPlaylistDataResponse(null, [], 0)
        );
      expect((result as any).highlightPlaylists).toHaveLength(1);
      expect((result as any).highlightPlaylists[0].playlist).toEqual(mockPlaylist);
    it('should override playlist names from SOURCE_INFO', async () => {
        playlist: { ...mockPlaylist, name: 'Original Name' },
        playlists: [],
        count: 0,
      expect((result as any).highlightPlaylists[0].playlist.name).toBe('Featured Playlist 2');
  describe('caching headers', () => {
    it('should set appropriate cache headers when not a data request', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
      expect(mockLoadEvent.setHeaders).toHaveBeenCalledWith({
        etag: expect.stringMatching(/^".*"$/),
        'last-modified': expect.any(String),
        'cache-control': 'private, max-age=120, must-revalidate',
        vary: 'Authorization, Cookie',
    it('should set public cache headers for anonymous users', async () => {
      const anonymousEvent = {
        locals: {
          ...mockLoadEvent.locals,
          session: null,
      await load(anonymousEvent);
        'cache-control': 'public, max-age=120, s-maxage=240',
    it('should not set headers when isDataRequest is true', async () => {
      const dataRequestEvent = {
        isDataRequest: true,
      await load(dataRequestEvent);
      expect(mockLoadEvent.setHeaders).not.toHaveBeenCalled();
  describe('error handling', () => {
    it('should handle video fetch errors gracefully', async () => {
      mockGetVideos.mockRejectedValue(new Error('Database error'));
      await expect(load(mockLoadEvent)).rejects.toThrow('Database error');
    it('should handle playlist fetch errors gracefully', async () => {
      mockGetPlaylistDataByYoutubeId.mockRejectedValue(new Error('Playlist error'));
      await expect(load(mockLoadEvent)).rejects.toThrow('Playlist error');
    it('should handle invalid content filter error', async () => {
      const { isVideoFilter } = await import('$lib/components/content/content-filter');
      vi.mocked(isVideoFilter).mockReturnValue(false);
      await expect(load(mockLoadEvent)).rejects.toThrow('Invalid content filter');
    it('should handle setHeaders errors gracefully', async () => {
      mockLoadEvent.setHeaders.mockImplementation(() => {
        throw new Error('Headers already set');
        playlist: null,
        videos: [],
      // Should not throw despite setHeaders error
      expect(result).toBeDefined();
  describe('parallel execution', () => {
    it('should execute major operations in parallel', async () => {
      const startTime = Date.now();
      let getVideosTime: number | null = null;
      let getPlaylistsTime: number | null = null;
      mockGetVideos.mockImplementation(async () => {
        getVideosTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 10));
        return createMockVideoResponse(mockVideos);
      mockGetPlaylistsForUsername.mockImplementation(async () => {
        getPlaylistsTime = Date.now();
        return { playlists: [], count: 0 };
      expect(getVideosTime).not.toBeNull();
      expect(getPlaylistsTime).not.toBeNull();
      if (getVideosTime && getPlaylistsTime) {
        const timeDifference = Math.abs(getVideosTime - getPlaylistsTime);
        // Should be called within 5ms of each other (concurrent)
        expect(timeDifference).toBeLessThan(5);
  describe('result structure', () => {
    it('should return complete result structure', async () => {
      expect(result).toEqual({
        videos: mockVideos,
        highlightPlaylists: [
          {
            playlist: { ...mockPlaylist, name: 'Featured Playlist 2' },
            videos: [mockVideos[0]],
          },
        ],
        processedSourcePlaylists: [
            ...mockSourcePlaylists[0],
            processedImageUrl: 'https://example.com/processed.jpg',
    it('should handle empty results gracefully', async () => {
      expect((result as any).videos).toEqual([]);
      expect((result as any).processedSourcePlaylists).toEqual([]);
});
