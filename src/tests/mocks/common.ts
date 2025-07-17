import { vi } from "vitest";
import { mockUser, mockSession } from "./auth";
import { mockSupabase } from "./supabase";
import { mockVideo, mockVideoWithTimestamp } from "./videos";
import { mockPlaylist } from "./playlists";
import { mockMediaQueryState } from "./media-query";

/**
 * Common mock setup for all tests
 * This file contains the core mock implementations that are shared across tests
 */

// Mock implementations for SvelteKit modules
export const mockSvelteKitModules = () => {
  // Create pageState in a way that's accessible to the mocks
  const state = {
    pageState: {
      url: new URL("http://localhost:3000"),
      route: { id: "/" },
      params: {},
      status: 200,
      error: null,
      data: {},
      state: {},
      form: null,
    }
  };

  // Mock $app/navigation
  vi.mock("$app/navigation", () => ({
    invalidate: vi.fn(),
    goto: vi.fn(),
    beforeNavigate: vi.fn(),
    afterNavigate: vi.fn(),
    preloadData: vi.fn(),
    preloadCode: vi.fn(),
    onNavigate: vi.fn(),
    pushState: vi.fn(),
    replaceState: vi.fn(),
    invalidateAll: vi.fn(),
  }));

  // Mock $app/state with proper getter/setter
  vi.mock("$app/state", () => ({
    page: {
      get url() {
        return state.pageState.url;
      },
      set url(value) {
        state.pageState.url = value;
      },
      get route() {
        return state.pageState.route;
      },
      get params() {
        return state.pageState.params;
      },
      get status() {
        return state.pageState.status;
      },
      get error() {
        return state.pageState.error;
      },
      get data() {
        return state.pageState.data;
      },
      get state() {
        return state.pageState.state;
      },
      get form() {
        return state.pageState.form;
      },
      subscribe: vi.fn(() => () => {}),
    },
  }));

  // Mock $app/environment
  vi.mock("$app/environment", () => ({
    browser: true,
    dev: true,
    building: false,
    version: "1.0.0",
  }));

  // Mock $app/stores
  vi.mock("$app/stores", () => ({
    page: {
      subscribe: vi.fn(() => () => {}),
    },
    navigating: {
      subscribe: vi.fn(() => () => {}),
    },
    updated: {
      subscribe: vi.fn(() => () => {}),
    },
  }));

  return state;
};

// Mock implementations for Supabase
export const mockSupabaseModules = () => {
  vi.mock("@supabase/ssr", () => ({
    isBrowser: vi.fn(() => false),
    createBrowserClient: vi.fn(() => mockSupabase),
    createServerClient: vi.fn(() => mockSupabase),
    parseCookieHeader: vi.fn(),
    serializeCookieHeader: vi.fn(),
  }));

  vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => mockSupabase),
  }));
};

// Mock implementations for media queries
export const mockMediaQueryModules = () => {
  vi.mock("$lib/state/media-query.svelte.js", () => ({
    getMediaQueryState: vi.fn(() => mockMediaQueryState),
    setMediaQueryState: vi.fn(() => mockMediaQueryState),
    MediaQueryState: vi.fn().mockImplementation(() => mockMediaQueryState),
  }));
};

// Mock implementations for content state
export const mockContentStateModules = () => {
  vi.mock("$lib/state/content.svelte.js", () => ({
    getContentState: vi.fn(() => ({
      selectedVideosBySection: {
        giantbomb: [],
        jeffgerstmann: [],
        nextlander: [],
        remap: [],
        continueWatching: [],
      },
      toggleVideoSelection: vi.fn(),
      clearSelectedVideos: vi.fn(),
      getSelectedVideos: vi.fn(() => []),
      isVideoSelected: vi.fn(() => false),
    })),
  }));
};

// Mock implementations for video queries
export const mockVideoQueryModules = () => {
  // Use vi.hoisted to ensure these are available at the top level
  const mocks = vi.hoisted(() => ({
    mockGetVideos: vi.fn().mockResolvedValue({
      videos: [mockVideo],
      count: 1,
      error: null,
    }),
    mockGetInProgressVideos: vi.fn().mockResolvedValue({
      videos: [mockVideoWithTimestamp],
      count: 1,
      error: null,
    }),
  }));

  vi.mock("$lib/supabase/videos", () => ({
    getVideos: mocks.mockGetVideos,
    getInProgressVideos: mocks.mockGetInProgressVideos,
    DEFAULT_NUM_VIDEOS_OVERVIEW: 30,
    updateVideoProgress: vi.fn(),
    deleteVideoProgress: vi.fn(),
    markVideoAsCompleted: vi.fn(),
  }));

  return mocks;
};

// Mock implementations for SvelteKit server functions
export const mockSvelteKitServerModules = () => {
  const mocks = vi.hoisted(() => ({
    mockRedirect: vi.fn().mockImplementation((status: number, location: string) => {
      const error = new Error(`Redirect to ${location}`) as any;
      error.name = "Redirect";
      error.status = status;
      error.location = location;
      throw error;
    }),
  }));

  vi.mock("@sveltejs/kit", () => ({
    redirect: mocks.mockRedirect,
    error: vi.fn(),
    json: vi.fn(),
    fail: vi.fn(),
  }));

  return mocks;
};

// Mock implementations for constants
export const mockConstantsModules = () => {
  vi.mock("$lib/constants/source", () => ({
    SOURCES: ["giantbomb", "jeffgerstmann", "nextlander", "remap"],
    SOURCE_INFO: {
      giantbomb: { displayName: "Giant Bomb", url: "https://giantbomb.com" },
      jeffgerstmann: { displayName: "Jeff Gerstmann", url: "https://jeffgerstmann.com" },
      nextlander: { displayName: "Nextlander", url: "https://nextlander.com" },
      remap: { displayName: "Remap", url: "https://remap.fm" },
    },
  }));
};

// Mock implementations for component modules
export const mockComponentModules = () => {
  vi.mock("$lib/components/content/content.svelte", () => ({
    default: vi.fn(() => ({
      render: () => ({ html: "<div>Mocked Content Component</div>" }),
      $$: {},
    })),
  }));

  vi.mock("$lib/components/content/content.js", () => ({
    getContentView: vi.fn(() => "tiles"),
    sourceWithContinueStateKeys: ["giantbomb", "jeffgerstmann", "nextlander", "remap", "continueWatching"],
  }));
};

/**
 * Initialize all common mocks
 * This should be called once at the beginning of test setup
 */
export const initializeCommonMocks = () => {
  const state = mockSvelteKitModules();
  mockSupabaseModules();
  mockMediaQueryModules();
  mockContentStateModules();
  const videoMocks = mockVideoQueryModules();
  const serverMocks = mockSvelteKitServerModules();
  mockConstantsModules();
  mockComponentModules();

  return {
    ...state,
    ...videoMocks,
    ...serverMocks,
  };
};

/**
 * Reset all mocks to their default state
 * This should be called before each test
 */
export const resetCommonMocks = () => {
  vi.clearAllMocks();
};